import express from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

const s3 = new S3Client({
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  }
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static('.'));

// HEALTH
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// STORY GENERATOR
function makeStory({ childName, age, theme, message }) {
  return [
    `Scene 1: ${childName}, a brave ${age}-year-old, begins a magical ${theme} adventure.`,
    `Scene 2: ${childName} explores a colorful world full of wonder.`,
    `Scene 3: A challenge appears, but ${childName} shows courage and kindness.`,
    `Scene 4: The world shines brighter thanks to ${childName}.`,
    `Scene 5: ${message || `${childName}, you are amazing and loved!`}`
  ];
}

// S3 UPLOAD
async function uploadBase64ImageToS3(base64Image, fileName = 'photo.jpg') {
  const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image format');

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

  return key;
}

// CREATE SIGNED URL
async function getSignedImageUrl(key) {
  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key
    }),
    { expiresIn: 60 * 60 }
  );
}

// CREATE ORDER
app.post('/api/orders', async (req, res) => {
  try {
    const { childName, age, theme, message, photoPreview, photoName } = req.body;

    const key = await uploadBase64ImageToS3(photoPreview, photoName);

    const id = Math.random().toString(36).slice(2, 10);
    const scenes = makeStory({ childName, age, theme, message });

    const order = {
      id,
      childName,
      age,
      theme,
      message,
      photoKey: key,
      scenes,
      story: scenes.join('\n\n'),
      status: 'story_ready'
    };

    orders.set(id, order);

    const photoUrl = await getSignedImageUrl(key);

    res.json({ order: { ...order, photoUrl } });
  } catch (e) {
    res.status(500).json({ error: 'Could not create order.', details: e.message });
  }
});

// GET ORDER
app.get('/api/orders/:id', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  const photoUrl = await getSignedImageUrl(order.photoKey);

  res.json({ order: { ...order, photoUrl } });
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

// GENERATE VIDEO
app.post('/api/orders/:id/generate-video', async (req, res) => {
  try {
    const order = orders.get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });

    const imageUrl = await getSignedImageUrl(order.photoKey);

    const response = await fetch('https://api.creatomate.com/v1/renders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: process.env.CREATOMATE_TEMPLATE_ID,
       modifications: {
  'Image-1.source': imageUrl,
  'Text-1.text': order.scenes[0],

  'Image-2.source': imageUrl,
  'Text-2.text': order.scenes[1],

  'Image-3.source': imageUrl,
  'Text-3.text': order.scenes[2],

  'Image-4.source': imageUrl,
  'Text-4.text': order.scenes[3],

  'Image-5.source': imageUrl,
  'Text-5.text': order.scenes[4]
}

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'Creatomate render failed.',
        details: data
      });
    }

    const render = Array.isArray(data) ? data[0] : data;

    order.status = 'rendering';
    order.videoJobId = render.id;

    res.json({ order });
  } catch (e) {
    res.status(500).json({ error: 'Video generation failed', details: e.message });
  }
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

// ✅ DOWNLOAD (FORCED DOWNLOAD FIX)
app.get('/api/orders/:id/download', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (!order.videoUrl) {
      return res.status(400).json({ error: 'Video not ready.' });
    }

    const videoResponse = await fetch(order.videoUrl);

    if (!videoResponse.ok) {
      return res.status(500).json({ error: 'Failed to fetch video.' });
    }

    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kidzrstarz-${order.id}.mp4"`
    );

    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: 'Download failed.', details: e.message });
  }
});

// FRONTEND
app.use((req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, () => {
  console.log(`Running on ${PORT}`);
});
