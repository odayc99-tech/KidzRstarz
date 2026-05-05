import express from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  }
});

app.use(express.json({ limit: '25mb' }));
app.use(express.static('.'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

function makeStory({ childName, age, theme, message }) {
  return [
    `Scene 1: ${childName}, a brave ${age}-year-old, begins a magical ${theme} adventure.`,
    `Scene 2: ${childName} explores a colorful world full of wonder.`,
    `Scene 3: A challenge appears, but ${childName} shows courage and kindness.`,
    `Scene 4: The world shines brighter thanks to ${childName}.`,
    `Scene 5: ${message || `${childName}, you are amazing and loved!`}`
  ];
}

async function uploadBase64ImageToS3(base64Image, fileName = 'photo.jpg') {
  const matches = base64Image.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid image format');

  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '-');
  const key = `uploads/${Date.now()}-${safeFileName}`;

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

async function getSignedImageUrl(key) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key
    }),
    { expiresIn: 60 * 60 }
  );
}

app.post('/api/orders', async (req, res) => {
  try {
    const { childName, age, theme, message, photoPreview, photoName } = req.body;

    if (!childName || !age || !theme) {
      return res.status(400).json({ error: 'Name, age, and theme are required.' });
    }

    const photoKey = await uploadBase64ImageToS3(photoPreview, photoName || 'photo.jpg');
    const photoUrl = await getSignedImageUrl(photoKey);

    const id = Math.random().toString(36).slice(2, 10);
    const scenes = makeStory({ childName, age, theme, message });

    const order = {
      id,
      childName,
      age,
      theme,
      message,
      photoKey,
      scenes,
      story: scenes.join('\n\n'),
      status: 'story_ready',
      videoReady: false
    };

    orders.set(id, order);

    res.json({
      order: {
        ...order,
        photoUrl
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Could not create order.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const photoUrl = order.photoKey ? await getSignedImageUrl(order.photoKey) : '';

    res.json({
      order: {
        ...order,
        photoUrl
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Could not get order.',
      details: error.message
    });
  }
});

app.post('/api/orders/:id/approve', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  order.status = 'approved';
  order.approvedAt = new Date().toISOString();

  orders.set(order.id, order);
  res.json({ order });
});

app.post('/api/orders/:id/checkout', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

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

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Order must be paid before video generation.' });
    }

    if (!order.photoKey) {
      return res.status(400).json({ error: 'No uploaded photo found.' });
    }

    const imageUrl = await getSignedImageUrl(order.photoKey);

    const payload = {
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
      error: 'Video generation failed.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id/check-video', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

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
      error: 'Video status check failed.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id/download', async (req, res) => {
  try {
    const order = orders.get(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (!order.videoReady || !order.videoUrl) {
      return res.status(400).json({ error: 'Video is not ready yet.' });
    }

    const videoResponse = await fetch(order.videoUrl);

    if (!videoResponse.ok) {
      return res.status(500).json({ error: 'Could not fetch rendered video.' });
    }

    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="kidzrstarz-${order.id}.mp4"`
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      error: 'Download failed.',
      details: error.message
    });
  }
});

app.use((req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
