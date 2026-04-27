import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// Fallback route
app.get('*', (req, res) => {
  res.sendFile(process.cwd() + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Running on ${PORT}`);
});
