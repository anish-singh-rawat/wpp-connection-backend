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


router.get('/health', (_req, res) => res.json({ status: 'ok' }));


router.post('/send', sendMessage);
router.post('/bulk-send', bulkSendMessage);
router.post('/bulk-send/csv', upload.single('file'), bulkSendCsv);


router.get('/queue', getQueue);
router.get('/queue/:jobId', getQueueJob);

router.get('/webhook/messages', getIncomingMessages);

module.exports = router;
