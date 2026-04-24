document.getElementById('form').onsubmit = async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(e.target));

  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const json = await res.json();

  alert('Order created: ' + json.order.id);
};
