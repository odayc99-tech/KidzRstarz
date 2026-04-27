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
    status: 'story_ready'
  };

  orders.set(id, order);
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

app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
