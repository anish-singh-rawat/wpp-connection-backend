'use strict';

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

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
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

router.use(limiter);


function requireApiKey(req, res, next) {
  if (!config.auth.apiKey) return next();

  const key =
    req.headers['x-api-key'] ||
    req.query.api_key;

  if (!key || key !== config.auth.apiKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Invalid or missing API key.' });
  }
  next();
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, 
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


router.post('/send',           requireApiKey, sendMessage);
router.post('/bulk-send',      requireApiKey, bulkSendMessage);
router.post('/bulk-send/csv',  requireApiKey, upload.single('file'), bulkSendCsv);

router.get('/queue',           requireApiKey, getQueue);
router.get('/queue/:jobId',    requireApiKey, getQueueJob);

router.get('/webhook/messages', requireApiKey, getIncomingMessages);

module.exports = router;
