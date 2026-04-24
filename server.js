import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { nanoid } from 'nanoid';

const app = express();
const PORT = process.env.PORT || 3000;

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const orders = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

function makeStory({ childName, age, theme, message }) {
  return `Once upon a time, ${childName}, age ${age}, went on a ${theme} adventure. ${message || ''}`;
}

app.post('/api/orders', (req, res) => {
  const { childName, age, theme, message } = req.body;

  const story = makeStory({ childName, age, theme, message });

  const order = {
    id: nanoid(),
    childName,
    age,
    theme,
    message,
    story,
    status: 'story_ready',
    paymentStatus: 'unpaid'
  };

  orders.set(order.id, order);
  res.json({ order });
});

app.post('/api/orders/:id/checkout', async (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Not found' });

  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Custom Kids Video'
            },
            unit_amount: 1900
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.APP_URL}/#success`,
      cancel_url: `${process.env.APP_URL}/#cancel`
    });

    return res.json({ url: session.url });
  }

  order.paymentStatus = 'paid';
  res.json({ order });
});

app.listen(PORT, () => console.log(`Running on ${PORT}`));
