'use strict';

const QRCode = require('qrcode');
const { getSession } = require('../whatsapp/client');
const logger = require('../utils/logger');

async function showQRPage(req, res) {
  const session = getSession();
  if (session.isReady) {
    return res.send(buildPage({
      title: '✅ WhatsApp Connected',
      body: `
        <div class="connected">
          <div class="icon">✅</div>
          <h2>Session is Active</h2>
          <p>WhatsApp is connected and ready to send messages.</p>
          <p class="session">Session: <strong>${session.sessionName}</strong></p>
        </div>
      `,
      refresh: false,
    }));
  }

  if (session.latestQR) {
    let qrDataUrl;
    try {
      qrDataUrl = await QRCode.toDataURL(session.latestQR, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      logger.error(`[QR] Failed to generate QR image: ${err.message}`);
      return res.status(500).send(buildPage({
        title: 'QR Error',
        body: `<p class="error">Failed to generate QR code: ${err.message}</p>`,
        refresh: true,
      }));
    }

    return res.send(buildPage({
      title: '📱 Scan QR Code',
      body: `
        <div class="qr-wrap">
          <h2>Scan with WhatsApp</h2>
          <p>Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong></p>
          <img src="${qrDataUrl}" alt="WhatsApp QR Code" class="qr-img" />
          <p class="hint">QR refreshes automatically every 20 seconds</p>
          <p class="status">Status: <span class="badge qr">Waiting for scan…</span></p>
        </div>
      `,
      refresh: true,
    }));
  }

  return res.send(buildPage({
    title: '⏳ Initialising…',
    body: `
      <div class="waiting">
        <div class="spinner"></div>
        <h2>Starting WhatsApp session…</h2>
        <p>Please wait. The QR code will appear here shortly.</p>
        <p class="status">Status: <span class="badge init">${session.status}</span></p>
      </div>
    `,
    refresh: true,
  }));
}

function getQRStatus(req, res) {
  const session = getSession();
  return res.json({
    status: session.status,
    isReady: session.isReady,
    hasQR: !!session.latestQR,
  });
}


function buildPage({ title, body, refresh }) {
  const refreshMeta = refresh
    ? '<meta http-equiv="refresh" content="20">'
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${refreshMeta}
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }

    h1 { font-size: 1.1rem; color: #888; margin-bottom: 24px; letter-spacing: 0.05em; }
    h2 { font-size: 1.4rem; margin-bottom: 12px; color: #fff; }
    p  { color: #aaa; line-height: 1.6; margin-bottom: 8px; font-size: 0.95rem; }
    p strong { color: #ddd; }

    .qr-img {
      display: block;
      margin: 20px auto;
      border-radius: 12px;
      border: 4px solid #25D366;
      width: 260px;
      height: 260px;
    }

    .hint { font-size: 0.8rem; color: #666; margin-top: 4px; }

    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge.qr   { background: #1a3a2a; color: #25D366; }
    .badge.init { background: #2a2a1a; color: #f0c040; }
    .badge.ok   { background: #1a3a2a; color: #25D366; }

    .connected .icon { font-size: 4rem; margin-bottom: 16px; }
    .session { margin-top: 16px; font-size: 0.85rem; color: #666; }

    /* Spinner */
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid #2a2a2a;
      border-top-color: #25D366;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error { color: #ff6b6b; }

    /* WhatsApp logo bar */
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 24px;
    }
    .logo svg { width: 28px; height: 28px; }
    .logo span { font-size: 1rem; font-weight: 600; color: #25D366; }
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
    <h1>${title}</h1>
    ${body}
  </div>
</body>
</html>`;
}

module.exports = { showQRPage, getQRStatus };
