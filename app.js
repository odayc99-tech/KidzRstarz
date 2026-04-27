document.getElementById('form').onsubmit = async (e) => {
  e.preventDefault();

  const form = new FormData(e.target);
  const photo = form.get('photo');

  let photoPreview = '';

  if (photo && photo.size > 0) {
    photoPreview = await fileToDataUrl(photo);
  }

  const data = {
    childName: form.get('childName'),
    age: form.get('age'),
    theme: form.get('theme'),
    message: form.get('message'),
    photoName: photo?.name || '',
    photoPreview
  };

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
    <section style="padding:60px; font-family:Arial; max-width:900px; margin:auto;">
      <h1>Story Preview Created 🎉</h1>
      <p><strong>Order ID:</strong> ${order.id}</p>

      ${order.photoPreview ? `
        <img src="${order.photoPreview}" alt="Uploaded child photo" style="max-width:220px;border-radius:20px;margin:20px 0;" />
      ` : ''}

      <h2>${order.childName}'s Story</h2>

      ${order.scenes.map((scene, index) => `
        <article style="background:#f3f0ff;padding:20px;border-radius:14px;margin:16px 0;">
          <h3>Scene ${index + 1}</h3>
          <p style="font-size:18px; line-height:1.6">${scene}</p>
        </article>
      `).join('')}

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

    document.getElementById('checkoutBtn').onclick = async () => {
      const response = await fetch(`/api/orders/${order.id}/checkout`, {
        method: 'POST'
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || 'Checkout failed');
        return;
      }

      document.getElementById('status').textContent = result.order.status;

      document.getElementById('checkoutBox').innerHTML = `
        <h2>Payment Complete 🎉</h2>
        <p>Your story has been paid for.</p>
        <button id="generateBtn" style="background:#00b894;color:white;padding:12px 20px;border:none;border-radius:25px;cursor:pointer;">
          Generate Video
        </button>
      `;

     document.getElementById('generateBtn').onclick = async () => {
  const response = await fetch(`/api/orders/${order.id}/generate-video`, {
    method: 'POST'
  });

  const result = await response.json();

  if (!response.ok) {
    alert(result.error || 'Failed to start video generation');
    return;
  }

  document.getElementById('checkoutBox').innerHTML = `
    <h2>Rendering Started 🎬</h2>
    <p>Your video is being generated. This usually takes a few seconds.</p>
    <button id="checkStatusBtn">Check Status</button>
  `;

  document.getElementById('checkStatusBtn').onclick = async () => {
    const res = await fetch(`/api/orders/${order.id}`);
    const data = await res.json();

    if (data.order.status === 'completed') {
      document.body.innerHTML = `
        <section style="padding:60px; font-family:Arial;">
          <h1>Video Ready 🎉</h1>
          <a href="${data.order.videoUrl}" download>
            Download Video
          </a>
        </section>
      `;
    } else {
      alert('Still rendering... try again in a few seconds');
    }
  };
};
    };
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
