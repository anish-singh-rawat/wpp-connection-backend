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
  sendMediaMessage,
  bulkSendMessage,
  bulkSendMediaMessage,
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

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 16 * 1024 * 1024 },  // 16MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // Videos
      'video/mp4', 'video/3gpp', 'video/quicktime',
      // Documents
      'application/pdf',
      'text/csv', 'application/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    ];
    // Also allow by extension for CSV (some browsers send wrong mime)
    const ext = file.originalname.split('.').pop().toLowerCase();
    if (allowed.includes(file.mimetype) || ext === 'csv' || ext === 'pdf') {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: Images, Videos, PDF, CSV/Excel.'));
    }
  },
});

router.get('/health', (_req, res) =>
  res.json({ status: 'ok', env: config.server.env, uptime: process.uptime() })
);

router.post  ('/devices',        requireApiKey, createDeviceHandler);
router.get   ('/devices',        requireApiKey, listDevicesHandler);
router.get   ('/devices/:token', requireApiKey, getDeviceHandler);
router.delete('/devices/:token', requireApiKey, deleteDeviceHandler);

router.get('/devices/:token/qrcode/events', resolveDevice, qrEventStream);
router.get('/devices/:token/qrcode/status', resolveDevice, getQRStatus);
router.get('/devices/:token/qrcode/image',  resolveDevice, getQRImage);

router.post('/devices/:token/send',                resolveDevice, sendMessage);
router.post('/devices/:token/send-media',          resolveDevice, mediaUpload.single('media'), sendMediaMessage);
router.post('/devices/:token/bulk-send',           resolveDevice, bulkSendMessage);
router.post('/devices/:token/bulk-send-media',     resolveDevice, mediaUpload.single('media'), bulkSendMediaMessage);
router.post('/devices/:token/bulk-send/csv',       resolveDevice, upload.single('file'), bulkSendCsv);
router.get ('/devices/:token/queue',          resolveDevice, getQueue);
router.get ('/devices/:token/queue/:jobId',   resolveDevice, getQueueJob);
router.get ('/devices/:token/messages',       resolveDevice, getIncomingMessages);

module.exports = router;
