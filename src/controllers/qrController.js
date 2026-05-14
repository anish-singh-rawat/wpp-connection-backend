'use strict';

const { getSession } = require('../whatsapp/client');
const { resolveSession } = require('../services/deviceRegistry');

const sseClients = new Map();

function getClients(sessionName) {
  if (!sseClients.has(sessionName)) sseClients.set(sessionName, new Set());
  return sseClients.get(sessionName);
}

function notifyQRUpdateForSession(sessionName, base64Qr) {
  const data = JSON.stringify({ type: 'qr', qr: base64Qr });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

function notifyConnectedForSession(sessionName) {
  const data = JSON.stringify({ type: 'connected' });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

function notifyStatusForSession(sessionName, status) {
  const data = JSON.stringify({ type: 'waiting', status });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
}

// Legacy no-ops
function notifyQRUpdate()  {}
function notifyConnected() {}
function notifyStatus()    {}


function resolveDevice(req, res, next) {
  const token = req.params.token;
  const sessionName = resolveSession(token);
  if (!sessionName) {
    return res.status(404).json({ success: false, error: 'Device not found. Invalid token.' });
  }
  req.sessionName = sessionName;
  next();
}


// GET /devices/:token/qrcode/events  — SSE stream
function qrEventStream(req, res) {
  const { sessionName } = req;

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const session = getSession(sessionName);

  if (session.isReady) {
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  } else if (session.latestQR && session.status === 'qr_ready') {
    res.write(`data: ${JSON.stringify({ type: 'qr', qr: session.latestQR })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'waiting', status: session.status })}\n\n`);
  }

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  getClients(sessionName).add(res);

  req.on('close', () => {
    clearInterval(ping);
    getClients(sessionName).delete(res);
  });
}


// GET /devices/:token/qrcode/status  — JSON status
function getQRStatus(req, res) {
  const session = getSession(req.sessionName);
  return res.json({
    token:   req.params.token,
    session: req.sessionName,
    status:  session.status,
    isReady: session.isReady,
    hasQR:   !!session.latestQR,
  });
}


// GET /devices/:token/qrcode/image  — QR as PNG (fallback for SSE failures)
function getQRImage(req, res) {
  const session = getSession(req.sessionName);

  if (!session.latestQR) {
    // QR not generated yet — tell the client to retry
    res.setHeader('Retry-After', '3');
    return res.status(202).json({
      success: false,
      status:  session.status,
      message: 'QR not available yet. Retry in a few seconds.',
    });
  }

  // latestQR is a data URI: "data:image/png;base64,<data>"
  const match = session.latestQR.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    // Already raw base64 — send as PNG
    const buf = Buffer.from(session.latestQR, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buf);
  }

  const [, mime, b64] = match;
  const buf = Buffer.from(b64, 'base64');
  res.setHeader('Content-Type', mime);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(buf);
}


module.exports = {
  resolveDevice,
  qrEventStream,
  getQRStatus,
  getQRImage,
  // Per-session notifiers (used by WhatsAppClient)
  notifyQRUpdateForSession,
  notifyConnectedForSession,
  notifyStatusForSession,
  // Legacy no-ops
  notifyQRUpdate,
  notifyConnected,
  notifyStatus,
};

