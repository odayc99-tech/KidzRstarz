import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

const s3 = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static('.'));

// HEALTH
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// STORY
function makeStory({ childName, age, theme, message }) {
  return [
    `Scene 1: ${childName}, a brave ${age}-year-old, begins a magical ${theme} adventure.`,
    `Scene 2: ${childName} explores a colorful world filled with wonder.`,
    `Scene 3: A challenge appears, but ${childName} uses courage and kindness.`,
    `Scene 4: The world brightens as ${childName} learns their true strength.`,
    `Scene 5: ${message || `${childName}, you are amazing and loved.`}`
  ];
}

// S3 UPLOAD
async function uploadBase64ImageToS3(base64Image, fileName) {
  const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image');

  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  const key = `uploads/${Date.now()}-${fileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );

  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
}

// CREATE ORDER
app.post('/api/orders', async (req, res) => {
  try {
    const { childName, age, theme, message, photoName, photoPreview } = req.body;

    if (!childName || !age || !theme) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const photoUrl = await uploadBase64ImageToS3(photoPreview, photoName);

    const id = Math.random().toString(36).slice(2, 10);
    const scenes = makeStory({ childName, age, theme, message });

    const order = {
      id,
      childName,
      age,
      theme,
      message,
      photoUrl,
      scenes,
      story: scenes.join('\n\n'),
      status: 'story_ready'
    };

    orders.set(id, order);
    res.json({ order });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET ORDER
app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ order });
});

// APPROVE
app.post('/api/orders/:id/approve', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  order.status = 'approved';
  res.json({ order });
});

// CHECKOUT
app.post('/api/orders/:id/checkout', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  order.status = 'paid';
  res.json({ order });
});

// START VIDEO RENDER
app.post('/api/orders/:id/generate-video', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const response = await fetch('https://api.creatomate.com/v1/renders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      template_id: process.env.CREATOMATE_TEMPLATE_ID,
      modifications: {
        'Video.source': order.photoUrl,
        'Text-1.text': `${order.childName}'s Adventure`,
        'Text-2.text': order.story
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return res.status(500).json({ error: 'Creatomate failed', details: data });
  }

  const render = Array.isArray(data) ? data[0] : data;

  order.status = 'rendering';
  order.videoJobId = render.id;

  res.json({ order });
});

// CHECK VIDEO STATUS
app.get('/api/orders/:id/check-video', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const response = await fetch(`https://api.creatomate.com/v1/renders/${order.videoJobId}`, {
    headers: {
      Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`
    }
  });

  const render = await response.json();

  if (render.status === 'succeeded') {
    order.status = 'completed';
    order.videoUrl = render.url;
  }

  res.json({ order });
});

// DOWNLOAD
app.get('/api/orders/:id/download', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order || !order.videoUrl) {
    return res.status(400).json({ error: 'Not ready' });
  }

  res.redirect(order.videoUrl);
});

// FRONTEND
app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, () => {
  console.log(`Running on ${PORT}`);
});
