document.getElementById('form').onsubmit = async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(e.target));

  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error || 'Something went wrong');
    return;
  }

  document.body.innerHTML = `
    <section style="padding:60px; font-family:Arial">
      <h1>Story Preview Created 🎉</h1>
      <p><strong>Order ID:</strong> ${result.order.id}</p>
      <h2>${result.order.childName}'s Story</h2>
      <p style="font-size:18px; line-height:1.6">${result.order.story}</p>
      <p><strong>Status:</strong> ${result.order.status}</p>
      <a href="/" style="display:inline-block;margin-top:20px;">Create another</a>
    </section>
  `;
};
