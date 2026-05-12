'use strict';

const { getSession } = require('../whatsapp/client');
const logger = require('../utils/logger');

const incomingMessages = new Map();
const MAX_STORED = 200;

function getStore(sessionName) {
  if (!incomingMessages.has(sessionName)) incomingMessages.set(sessionName, []);
  return incomingMessages.get(sessionName);
}


function registerIncomingListener(sessionName) {
  const session = getSession(sessionName);
  session.onMessage(async (msg) => {
    const store = getStore(sessionName);
    store.unshift({
      from:       msg.from,
      body:       msg.body,
      type:       msg.type,
      timestamp:  new Date(msg.timestamp * 1000),
      receivedAt: new Date(),
    });
    if (store.length > MAX_STORED) store.length = MAX_STORED;
    logger.info(`[Webhook:${sessionName}] Incoming from ${msg.from}`);
  });
}

function getIncomingMessages(req, res) {
  const { sessionName } = req;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_STORED);
  const store = getStore(sessionName);
  return res.json({
    success:  true,
    session:  sessionName,
    count:    store.length,
    messages: store.slice(0, limit),
  });
}

module.exports = { registerIncomingListener, getIncomingMessages };
