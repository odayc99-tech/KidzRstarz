import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

app.use(express.json({ limit: '10mb' }));
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
    `Scene 5: The adventure ends with cheers, music, and a special message: ${message || `${childName}, you are loved, amazing, and capable of wonderful things.`}`
  ];
}

app.post('/api/orders', (req, res) => {
  const { childName, age, theme, message, photoName, photoPreview } = req.body;

  if (!childName || !age || !theme) {
    return res.status(400).json({ error: 'Name, age, and theme are required.' });
  }

  const id = Math.random().toString(36).slice(2, 10);
  const scenes = makeStory({ childName, age, theme, message });

  const order = {
    id,
    childName,
    age,
    theme,
    message,
    photoName,
    photoPreview,
    scenes,
    story: scenes.join('\n\n'),
    status: 'story_ready',
    videoReady: false
  };

  orders.set(id, order);
  res.json({ order });
});

app.get('/api/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  res.json({ order });
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

app.post('/api/orders/:id/checkout', async (req, res) => {
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
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (order.status !== 'paid') {
    return res.status(400).json({ error: 'Order must be paid before video generation.' });
  }

  if (!process.env.CREATOMATE_API_KEY || !process.env.CREATOMATE_TEMPLATE_ID) {
    return res.status(500).json({
      error: 'Creatomate is not configured. Add CREATOMATE_API_KEY and CREATOMATE_TEMPLATE_ID in Railway.'
    });
  }

  try {
    const response = await fetch('https://api.creatomate.com/v1/renders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: process.env.CREATOMATE_TEMPLATE_ID,
        modifications: {
          'Video.source': 'https://creatomate.com/files/assets/7347c3b7-e1a8-4439-96f1-f3dfc95c3d28',
          'Text-1.text': `${order.childName}'s Magical ${order.theme} Adventure`,
          'Text-2.text': order.story
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'Creatomate render failed.',
        details: data
      });
    }

    const render = Array.isArray(data) ? data[0] : data;

    order.status = 'completed';
    order.videoReady = true;
    order.videoJobId = render.id;
    order.videoUrl = render.url || render.output_url || '';

    orders.set(order.id, order);
    res.json({ order });
  } catch (error) {
    res.status(500).json({
      error: 'Video generation failed.',
      details: error.message
    });
  }
});

app.get('/api/orders/:id/download', (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (!order.videoReady) {
    return res.status(400).json({ error: 'Video is not ready yet.' });
  }

  if (order.videoUrl) {
    return res.redirect(order.videoUrl);
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="kidzrstarz-${order.id}-video-placeholder.txt"`
  );

  res.send(`Video completed for ${order.childName}, but no video URL was returned.`);
});

app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
