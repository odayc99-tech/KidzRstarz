import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
        }
      : undefined
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static('.'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

function makeStory({ childName, age, theme, message }) {
  return [
    `Scene 1: ${childName}, a bright and brave ${age}-year-old, wakes up to discover a sparkling invitation to a magical ${theme} adventure.`,
    `Scene 2: With a big smile and a curious heart, ${childName} steps into a colorful world filled with friendly characters, glowing lights, and exciting surprises.`,
    `Scene 3: A challenge appears, but ${childName} uses kindness, imagination, and courage to help everyone work together.`,
    `Scene 4: The whole world begins to shine brighter as ${childName} learns that being thoughtful, brave, and true to yourself is the greatest superpower of all.`,
    `Scene 5: The adventure ends with cheers, music, and a special message: ${
      message || `${childName}, you are loved, amazing, and capable of wonderful things.`
    }`
  ];
}

async function uploadBase64ImageToS3(base64Image, fileName = 'child-photo.png') {
  if (!base64Image) throw new Error('No image was uploaded.');
  if (!process.env.S3_BUCKET) throw new Error('S3_BUCKET is not configured.');

  const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image format.');

  const contentType = matches[1];
  const imageBuffer = Buffer.from(matches[2], 'base64');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: imageBuffer,
      ContentType: contentType
    })
  );

  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

app.post('/api/orders', async (req, res) => {
  try {
    const { childName, age, theme, message, photoName, photoPreview } = req.body;

    if (!childName || !age || !theme) {
      return res.status(400).json({ error: 'Name, age, and theme are required.' });
    }

    const photoUrl = await uploadBase64ImageToS3(photoPreview, photoName || 'child-photo.png');

    const id = Math.random().toString(36).slice(2, 10);
    const scenes = makeStory({ childName, age, theme, message });

    const order = {
      id,
      childName,
      age,
      theme,
      message,
      photoName,
      photoUrl,
      scenes,
      story: scenes.join('\n\n'),
      status: 'story_ready',
      videoReady: false
    };

    orders.set(id, order);
    res.json({ order });
  } catch (error) {
    res.status(500).json({
      error: 'Could not create order.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});

app.post('/api/orders/:id/approve', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  order.status = 'approved';
  order.approvedAt = new Date().toISOString();

  orders.set(order.id, order);
  res.json({ order });
});

app.post('/api/orders/:id/checkout', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (order.status !== 'approved') {
    return res.status(400).json({ error: 'Order must be approved first.' });
  }

  order.status = 'paid';
  order.paidAt = new Date().toISOString();

  orders.set(order.id, order);
  res.json({ order });
});

app.post('/api/orders/:id/generate-video', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Order must be paid before video generation.' });
    }

    if (!order.photoUrl) {
      return res.status(400).json({ error: 'No uploaded photo URL found.', order });
    }

    if (!process.env.CREATOMATE_API_KEY || !process.env.CREATOMATE_TEMPLATE_ID) {
      return res.status(500).json({
        error: 'Creatomate is not configured.',
        details: 'Add CREATOMATE_API_KEY and CREATOMATE_TEMPLATE_ID in Railway.'
      });
    }

    const payload = {
      template_id: process.env.CREATOMATE_TEMPLATE_ID,
      modifications: {
        'Image.source': order.photoUrl,
        'Text-1.text': `${order.childName}'s Magical ${order.theme} Adventure`,
        'Text-2.text': order.story
      }
    };

    const response = await fetch('https://api.creatomate.com/v1/renders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'Creatomate render failed.',
        payload,
        details: data
      });
    }

    const render = Array.isArray(data) ? data[0] : data;

    order.status = 'rendering';
    order.videoReady = false;
    order.videoJobId = render.id;

    orders.set(order.id, order);

    res.json({ order, render });
  } catch (error) {
    res.status(500).json({
      error: 'Video generation crashed.',
      details: error.message,
      stack: error.stack
    });
  }
});

app.get('/api/orders/:id/check-video', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (!order.videoJobId) {
      return res.status(400).json({ error: 'No video job found.' });
    }

    const response = await fetch(`https://api.creatomate.com/v1/renders/${order.videoJobId}`, {
      headers: {
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`
      }
    });

    const render = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'Could not check render status.',
        details: render
      });
    }

    if (render.status === 'succeeded' && render.url) {
      order.status = 'completed';
      order.videoReady = true;
      order.videoUrl = render.url;
    } else if (render.status === 'failed') {
      order.status = 'failed';
      order.errorMessage = render.error || 'Creatomate render failed.';
    } else {
      order.status = 'rendering';
    }

    orders.set(order.id, order);
    res.json({ order, render });
  } catch (error) {
    res.status(500).json({
      error: 'Video status check crashed.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id/download', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Order not found.' });

  if (!order.videoReady || !order.videoUrl) {
    return res.status(400).json({ error: 'Video is not ready yet.' });
  }

  return res.redirect(order.videoUrl);
});

app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
