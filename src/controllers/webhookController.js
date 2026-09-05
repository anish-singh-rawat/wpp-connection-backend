'use strict';

const { getSession } = require('../whatsapp/client');
const IncomingMessage = require('../models/IncomingMessage');
const { getDevice } = require('../services/deviceRegistry');
const socketManager = require('../services/socketManager');
const logger = require('../utils/logger');
const { buildTenantFilter } = require('../utils/tenantHelpers');


function registerIncomingListener(sessionName, deviceDoc = null) {
  const session = getSession(sessionName);

  session.onMessage(async (msg) => {
    try {
      const saved = await IncomingMessage.create({
        sessionName,
        from:          msg.from,
        body:          msg.body,
        type:          msg.type,
        timestamp:     msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(),
        receivedAt:    new Date(),
        customerId:    deviceDoc?.customerId    || null,
        subCustomerId: deviceDoc?.subCustomerId || null,
        deviceToken:   deviceDoc?.token         || null,
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
  try {
    const { sessionName } = req;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    if (req.user) {
      const tenantFilter = buildTenantFilter(req);
      const device = await getDevice(req.params.token, tenantFilter);
      if (!device) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden. Device does not belong to your account.',
        });
      }
    }

    const messageFilter = { sessionName };

    if (req.user) {
      const tenantFilter = buildTenantFilter(req);
      Object.assign(messageFilter, tenantFilter);
    }

    const messages = await IncomingMessage.find(messageFilter)
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
