'use strict';

const { getSession } = require('../whatsapp/client');
const logger = require('../utils/logger');

const sseClients = new Set();

function notifyQRUpdate(base64Qr) {
  const data = JSON.stringify({ type: 'qr', qr: base64Qr });
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

function notifyConnected() {
  const data = JSON.stringify({ type: 'connected' });
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

function notifyStatus(status) {
  const data = JSON.stringify({ type: 'waiting', status });
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

function showQRPage(_req, res) {
  const session = getSession();
  res.setHeader('Content-Type', 'text/html');
  res.send(buildPage(session));
}

function qrEventStream(req, res) {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const session = getSession();

  // Send current state immediately on connect
  if (session.isReady) {
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  } else if (session.latestQR && session.status === 'qr_ready') {
    // QR available and session still alive — show it
    res.write(`data: ${JSON.stringify({ type: 'qr', qr: session.latestQR })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'waiting', status: session.status })}\n\n`);
  }

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
}

function getQRStatus(_req, res) {
  const session = getSession();
  return res.json({
    status:  session.status,
    isReady: session.isReady,
    hasQR:   !!session.latestQR,
  });
}

// ─── HTML page ────────────────────────────────────────────────────────────────

function buildPage(session) {
  // Determine initial state to render server-side
  let initialHtml;
  if (session.isReady) {
    initialHtml = connectedHtml(session.sessionName);
  } else if (session.latestQR) {
    initialHtml = qrHtml(session.latestQR);
  } else {
    initialHtml = waitingHtml(session.status);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WPPConnect — QR Login</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#0d1117;color:#e6edf3;
      min-height:100vh;display:flex;align-items:center;justify-content:center;
    }
    .card{
      background:#161b22;border:1px solid #30363d;border-radius:16px;
      padding:40px 36px;text-align:center;max-width:420px;width:92%;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
    }
    .logo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:28px}
    .logo svg{width:30px;height:30px}
    .logo span{font-size:1.05rem;font-weight:700;color:#25D366;letter-spacing:.03em}
    h2{font-size:1.3rem;margin-bottom:10px;color:#fff}
    p{color:#8b949e;line-height:1.65;margin-bottom:8px;font-size:.93rem}
    p strong{color:#c9d1d9}

    /* QR image */
    .qr-img{
      display:block;margin:20px auto;
      border-radius:12px;border:4px solid #25D366;
      width:264px;height:264px;background:#fff;
    }
    .hint{font-size:.78rem;color:#484f58;margin-top:4px}

    /* Badge */
    .badge{
      display:inline-block;padding:3px 12px;border-radius:20px;
      font-size:.78rem;font-weight:600;
    }
    .badge.qr      {background:#0d2818;color:#25D366}
    .badge.waiting {background:#2d2208;color:#e3b341}
    .badge.ok      {background:#0d2818;color:#25D366}

    /* Connected */
    .icon{font-size:3.5rem;margin-bottom:14px}
    .session{margin-top:14px;font-size:.82rem;color:#484f58}

    /* Spinner */
    .spinner{
      width:48px;height:48px;
      border:4px solid #21262d;border-top-color:#25D366;
      border-radius:50%;animation:spin .8s linear infinite;
      margin:0 auto 20px;
    }
    @keyframes spin{to{transform:rotate(360deg)}}

    /* Steps */
    .steps{
      text-align:left;margin-top:18px;
      background:#0d1117;border-radius:8px;padding:14px 16px;
    }
    .steps li{
      color:#8b949e;font-size:.85rem;line-height:1.8;
      list-style:none;padding-left:4px;
    }
    .steps li::before{content:"→ ";color:#25D366}

    #status-dot{
      display:inline-block;width:8px;height:8px;border-radius:50%;
      background:#e3b341;margin-right:6px;vertical-align:middle;
    }
    #status-dot.connected{background:#25D366}
  </style>
</head>
<body>
<div class="card">
  <div class="logo">
    <svg viewBox="0 0 24 24" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
    <span>WPPConnect API</span>
  </div>

  <div id="content">${initialHtml}</div>
</div>

<script>
  // ── SSE — instant updates without page refresh ──────────────────────────
  const content = document.getElementById('content');

  function qrHtml(qr) {
    return \`
      <h2>Scan QR Code</h2>
      <p>Open WhatsApp on your phone</p>
      <ol class="steps">
        <li>Tap <strong>Linked Devices</strong></li>
        <li>Tap <strong>Link a Device</strong></li>
        <li>Point camera at the QR below</li>
      </ol>
      <img class="qr-img" src="\${qr}" alt="WhatsApp QR Code"/>
      <p class="hint"><span id="status-dot"></span>Waiting for scan…</p>
    \`;
  }

  function connectedHtml() {
    return \`
      <div class="icon">✅</div>
      <h2>WhatsApp Connected</h2>
      <p>Session is active and ready to send messages.</p>
      <p class="hint"><span id="status-dot" class="connected"></span>Connected</p>
    \`;
  }

  function waitingHtml(status) {
    const isRetrying = status && status.includes('retrying');
    const msg = isRetrying
      ? 'Previous attempt timed out. Retrying automatically…'
      : 'Launching browser. QR code will appear here automatically.';
    return \`
      <div class="spinner"></div>
      <h2>\${isRetrying ? 'Retrying…' : 'Starting session…'}</h2>
      <p>\${msg}</p>
      <p class="hint"><span id="status-dot"></span>Status: \${status || 'initialising'}</p>
    \`;
  }

  const evtSource = new EventSource('/qrcode/events');

  evtSource.onmessage = function(e) {
    const msg = JSON.parse(e.data);
    if (msg.type === 'qr') {
      content.innerHTML = qrHtml(msg.qr);
    } else if (msg.type === 'connected') {
      content.innerHTML = connectedHtml();
      evtSource.close(); // no more updates needed
    } else if (msg.type === 'waiting') {
      content.innerHTML = waitingHtml(msg.status);
    }
  };

  evtSource.onerror = function() {
    // SSE dropped — retry silently after 3s
    setTimeout(() => location.reload(), 3000);
  };
</script>
</body>
</html>`;
}

// ─── HTML fragments ───────────────────────────────────────────────────────────

function qrHtml(qr) {
  return `
    <h2>Scan QR Code</h2>
    <p>Open WhatsApp on your phone</p>
    <ol class="steps">
      <li>Tap <strong>Linked Devices</strong></li>
      <li>Tap <strong>Link a Device</strong></li>
      <li>Point camera at the QR below</li>
    </ol>
    <img class="qr-img" src="${qr}" alt="WhatsApp QR Code"/>
    <p class="hint"><span id="status-dot"></span>Waiting for scan…</p>
  `;
}

function connectedHtml(sessionName) {
  return `
    <div class="icon">✅</div>
    <h2>WhatsApp Connected</h2>
    <p>Session is active and ready to send messages.</p>
    <p class="session">Session: <strong>${sessionName}</strong></p>
    <p class="hint"><span id="status-dot" class="connected"></span>Connected</p>
  `;
}

function waitingHtml(status) {
  return `
    <div class="spinner"></div>
    <h2>Starting session…</h2>
    <p>Launching browser. QR code will appear here automatically.</p>
    <p class="hint"><span id="status-dot"></span>Status: ${status || 'initialising'}</p>
  `;
}

module.exports = { showQRPage, qrEventStream, getQRStatus, notifyQRUpdate, notifyConnected, notifyStatus };
