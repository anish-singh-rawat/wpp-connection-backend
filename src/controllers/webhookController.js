'use strict';

const { getSession } = require('../whatsapp/client');
const config = require('../config');
const logger = require('../utils/logger');

// In-memory store for received messages (replace with DB in production)
const incomingMessages = [];
const MAX_STORED = 200;

function registerIncomingListener() {
  const session = getSession();

  session.onMessage(async (msg) => {
    const entry = {
      from: msg.from,
      body: msg.body,
      type: msg.type,
      timestamp: new Date(msg.timestamp * 1000),
      receivedAt: new Date(),
    };

    incomingMessages.unshift(entry);

    if (incomingMessages.length > MAX_STORED) {
      incomingMessages.length = MAX_STORED;
    }

    logger.info(`[Webhook] Incoming from ${msg.from}: ${msg.body}`);
  });
}


function getIncomingMessages(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_STORED);
  return res.json({
    success: true,
    count: incomingMessages.length,
    messages: incomingMessages.slice(0, limit),
  });
}

module.exports = { registerIncomingListener, getIncomingMessages };
