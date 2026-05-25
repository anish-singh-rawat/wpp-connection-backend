'use strict';

const { getSession } = require('../whatsapp/client');
const { resolveSession, listDevices } = require('../services/deviceRegistry');
const socketManager = require('../services/socketManager');

const sseClients = new Map();

const sessionTokenMap = new Map();

function registerSessionToken(sessionName, token) {
  sessionTokenMap.set(sessionName, token);
}

function getClients(sessionName) {
  if (!sseClients.has(sessionName)) sseClients.set(sessionName, new Set());
  return sseClients.get(sessionName);
}
async function resolveToken(sessionName) {
  if (sessionTokenMap.has(sessionName)) {
    return sessionTokenMap.get(sessionName);
  }
  try {
    const devices = await listDevices();
    for (const d of devices) {
      sessionTokenMap.set(d.sessionName, d.token);
    }
    return sessionTokenMap.get(sessionName) || null;
  } catch (_) {
    return null;
  }
}
function notifyQRUpdateForSession(sessionName, base64Qr) {
  const data = JSON.stringify({ type: 'qr', qr: base64Qr });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
  resolveToken(sessionName).then((token) => {
    if (!token) return;
    socketManager.emitDeviceQR(token, sessionName, base64Qr);
    socketManager.emitDeviceStatus(token, sessionName, 'qr_ready', false);
  });
}

function notifyConnectedForSession(sessionName) {
  const session = getSession(sessionName);
  if (!session) return;

  const data = JSON.stringify({ type: 'connected' });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
  resolveToken(sessionName).then((token) => {
    if (!token) return;
    socketManager.emitDeviceConnected(token, sessionName);
    socketManager.emitDeviceStatus(token, sessionName, 'connected', true);
    socketManager.emitDevicesUpdate();
  });
}

function notifyStatusForSession(sessionName, status) {
  const data = JSON.stringify({ type: 'waiting', status });
  for (const res of getClients(sessionName)) {
    try { res.write(`data: ${data}\n\n`); } catch (_) {}
  }
  resolveToken(sessionName).then((token) => {
    if (!token) return;
    const session = getSession(sessionName);
    socketManager.emitDeviceStatus(token, sessionName, status, session?.isReady ?? false);
  });
}

function notifyQRUpdate()  {}
function notifyConnected() {}
function notifyStatus()    {}


async function resolveDevice(req, res, next) {
  const token = req.params.token;

  let sessionName = null;
  for (let i = 0; i < 6; i++) {
    try {
      sessionName = await resolveSession(token);
    } catch (_) {}
    if (sessionName) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!sessionName) {
    return res.status(404).json({ success: false, error: 'Device not found. Invalid token.' });
  }
  req.sessionName = sessionName;
  next();
}


function qrEventStream(req, res) {
  const { sessionName } = req;

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const session = getSession(sessionName);
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  getClients(sessionName).add(res);

  req.on('close', () => {
    clearInterval(ping);
    getClients(sessionName).delete(res);
  });

  if (!session) {
    res.write(`data: ${JSON.stringify({ type: 'waiting', status: 'launching' })}\n\n`);
    return;
  }

  if (session.status === 'connected') {
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  } else if (session.latestQR) {
    res.write(`data: ${JSON.stringify({ type: 'qr', qr: session.latestQR })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: 'waiting', status: session.status })}\n\n`);
  }
}

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

function getQRImage(req, res) {
  const session = getSession(req.sessionName);

  if (!session.latestQR) {
    res.setHeader('Retry-After', '3');
    return res.status(202).json({
      success: false,
      status:  session.status,
      message: 'QR not available yet. Retry in a few seconds.',
    });
  }

  const match = session.latestQR.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
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
  notifyQRUpdateForSession,
  notifyConnectedForSession,
  notifyStatusForSession,
  notifyQRUpdate,
  notifyConnected,
  notifyStatus,
  registerSessionToken,   
};

