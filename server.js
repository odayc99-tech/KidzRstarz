import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
app.post('/api/orders/:id/checkout', async (req, res) => {
  const order = orders.get(req.params.id);

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (order.status !== 'approved') {
    return res.status(400).json({ error: 'Order must be approved first.' });
  }

  if (!stripe) {
    // fallback if Stripe not set yet
    order.status = 'paid';
    return res.json({ order });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `KidzRstarz Video for ${order.childName}`
          },
          unit_amount: 1900
        },
        quantity: 1
      }
    ],
    success_url: `${process.env.APP_URL}/#success`,
    cancel_url: `${process.env.APP_URL}/#cancel`,
    metadata: {
      orderId: order.id
    }
  });

  res.json({ url: session.url });
});
