import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

const orders = new Map();

app.use(express.json());
app.use(express.static('.'));

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

app.post('/api/orders', (req, res) => {
  const { childName, age, theme, message } = req.body;

  if (!childName || !age || !theme) {
    return res.status(400).json({ error: 'Name, age, and theme are required.' });
  }

  const id = Math.random().toString(36).slice(2, 10);

  const story = `Once upon a magical day, ${childName}, age ${age}, became the star of a ${theme} adventure. With courage, kindness, and imagination, ${childName} discovered that anything is possible. ${message || ''}`;

  const order = {
    id,
    childName,
    age,
    theme,
    message,
    story,
    status: 'story_ready'
  };

  orders.set(id, order);

  res.json({ order });
});

app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
