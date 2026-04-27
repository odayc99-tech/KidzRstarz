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

  showStoryPreview(result.order);
};

function showStoryPreview(order) {
  document.body.innerHTML = `
    <section style="padding:60px; font-family:Arial; max-width:800px; margin:auto;">
      <h1>Story Preview Created 🎉</h1>
      <p><strong>Order ID:</strong> ${order.id}</p>

      <h2>${order.childName}'s Story</h2>
      <p style="font-size:18px; line-height:1.6">${order.story}</p>

      <p><strong>Status:</strong> <span id="status">${order.status}</span></p>

      <button id="approveBtn" style="background:#7c3cff;color:white;padding:12px 20px;border:none;border-radius:25px;cursor:pointer;">
        Approve Story
      </button>

      <div id="checkoutBox" style="display:none;margin-top:30px;padding:20px;background:#f3f0ff;border-radius:12px;">
        <h2>Story Approved ✅</h2>
        <p>You can now continue to checkout.</p>
        <button id="checkoutBtn" style="background:#ff4fa3;color:white;padding:12px 20px;border:none;border-radius:25px;cursor:pointer;">
          Continue to Checkout
        </button>
      </div>

      <p style="margin-top:30px;">
        <a href="/">Create another</a>
      </p>
    </section>
  `;

  document.getElementById('approveBtn').onclick = async () => {
    const response = await fetch(`/api/orders/${order.id}/approve`, {
      method: 'POST'
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || 'Could not approve story');
      return;
    }

    document.getElementById('status').textContent = result.order.status;
    document.getElementById('approveBtn').style.display = 'none';
    document.getElementById('checkoutBox').style.display = 'block';

    document.getElementById('checkoutBtn').onclick = () => {
      alert('Checkout step comes next.');
    };
  };
}
