'use strict';

const express = require('express');
const multer  = require('multer');
const rateLimit = require('express-rate-limit');

const {
  createDeviceHandler,
  listDevicesHandler,
  getDeviceHandler,
  deleteDeviceHandler,
} = require('../controllers/deviceController');

const {
  resolveDevice,
  qrEventStream,
  getQRStatus,
  getQRImage,
} = require('../controllers/qrController');

const {
  sendMessage,
  bulkSendMessage,
  bulkSendCsv,
  getQueue,
  getQueueJob,
} = require('../controllers/messageController');

const { getIncomingMessages } = require('../controllers/webhookController');
const config = require('../config');

const router = express.Router();

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max:      config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, error: 'Too many requests.' },
});

router.use(limiter);

function requireApiKey(req, res, next) {
  if (!config.auth.apiKey) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== config.auth.apiKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Invalid or missing API key.' });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted.'));
    }
  },
});

router.get('/health', (_req, res) =>
  res.json({ status: 'ok', env: config.server.env, uptime: process.uptime() })
);

// ─── Device management (requires master API key) ──────────────────────────────

router.post  ('/devices',        requireApiKey, createDeviceHandler);
router.get   ('/devices',        requireApiKey, listDevicesHandler);
router.get   ('/devices/:token', requireApiKey, getDeviceHandler);
router.delete('/devices/:token', requireApiKey, deleteDeviceHandler);

// ─── Per-device QR (no master API key — token IS the auth) ───────────────────

router.get('/devices/:token/qrcode/events', resolveDevice, qrEventStream);
router.get('/devices/:token/qrcode/status', resolveDevice, getQRStatus);
router.get('/devices/:token/qrcode/image',  resolveDevice, getQRImage);

// ─── Per-device messaging (token IS the auth) ─────────────────────────────────

router.post('/devices/:token/send',           resolveDevice, sendMessage);
router.post('/devices/:token/bulk-send',      resolveDevice, bulkSendMessage);
router.post('/devices/:token/bulk-send/csv',  resolveDevice, upload.single('file'), bulkSendCsv);
router.get ('/devices/:token/queue',          resolveDevice, getQueue);
router.get ('/devices/:token/queue/:jobId',   resolveDevice, getQueueJob);
router.get ('/devices/:token/messages',       resolveDevice, getIncomingMessages);

module.exports = router;
