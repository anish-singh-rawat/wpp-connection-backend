'use strict';

const { getSession } = require('../whatsapp/client');
const IncomingMessage = require('../models/IncomingMessage');
const socketManager = require('../services/socketManager');
const logger = require('../utils/logger');

function registerIncomingListener(sessionName) {
  const session = getSession(sessionName);

  session.onMessage(async (msg) => {
    try {
      const saved = await IncomingMessage.create({
        sessionName,
        from:       msg.from,
        body:       msg.body,
        type:       msg.type,
        timestamp:  msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
        receivedAt: new Date(),
      });
      logger.info(`[Webhook:${sessionName}] Incoming from ${msg.from} — saved to DB`);

      socketManager.emitInboxMessage(sessionName, {
        sessionName,
        from:       saved.from,
        body:       saved.body,
        type:       saved.type,
        timestamp:  saved.timestamp,
        receivedAt: saved.receivedAt,
      });
    } catch (err) {
      logger.error(`[Webhook:${sessionName}] Failed to save incoming message: ${err.message}`);
    }
  });
}

async function getIncomingMessages(req, res) {
  const { sessionName } = req;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const messages = await IncomingMessage.find({ sessionName })
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success:  true,
      session:  sessionName,
      count:    messages.length,
      messages,
    });
  } catch (err) {
    logger.error(`[Webhook] getIncomingMessages error: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Failed to fetch messages.' });
  }
}

module.exports = { registerIncomingListener, getIncomingMessages };
