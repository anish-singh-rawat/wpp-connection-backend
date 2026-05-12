'use strict';

/**
 * Session Manager
 * ───────────────
 * Manages lifecycle of all WhatsApp sessions.
 * Each device token maps to one WhatsAppClient instance.
 * Handles init, retry, and graceful shutdown for all sessions.
 */

const { WhatsAppClient, getSession } = require('../whatsapp/client');
const { listDevices } = require('./deviceRegistry');
const logger = require('../utils/logger');

// Track retry timers so we can cancel them on shutdown
const retryTimers = new Map();

/**
 * Start a single session with auto-retry on failure.
 * @param {string} sessionName
 * @param {number} attempt
 */
function startSession(sessionName, attempt = 1) {
  logger.info(`[SessionMgr] Starting "${sessionName}" (attempt #${attempt})...`);

  const session = getSession(sessionName);
  session.isReady  = false;
  session.status   = 'launching';
  session.latestQR = null;
  session.client   = null;

  session.init()
    .then(() => {
      logger.info(`[SessionMgr] "${sessionName}" is ready.`);
      // Register incoming message listener
      try {
        require('../controllers/webhookController').registerIncomingListener(sessionName);
      } catch (_) {}
      // Cancel any pending retry timer
      if (retryTimers.has(sessionName)) {
        clearTimeout(retryTimers.get(sessionName));
        retryTimers.delete(sessionName);
      }
    })
    .catch((err) => {
      logger.error(`[SessionMgr] "${sessionName}" init failed (attempt #${attempt}): ${err.message}`);
      session.client   = null;
      session.isReady  = false;
      session.latestQR = null;
      session.status   = 'retrying';

      // Notify SSE clients for this session
      try {
        require('../controllers/qrController').notifyStatusForSession(sessionName, 'retrying');
      } catch (_) {}

      const delay = Math.min(15000 * attempt, 60000);
      logger.info(`[SessionMgr] Retrying "${sessionName}" in ${delay / 1000}s...`);
      const timer = setTimeout(() => startSession(sessionName, attempt + 1), delay);
      retryTimers.set(sessionName, timer);
    });
}

/**
 * Boot all previously registered devices on server startup.
 */
function bootAllDevices() {
  const devices = listDevices();
  if (devices.length === 0) {
    logger.info('[SessionMgr] No registered devices. Use POST /devices to add one.');
    return;
  }
  logger.info(`[SessionMgr] Booting ${devices.length} device(s)...`);
  for (const device of devices) {
    startSession(device.sessionName);
  }
}

/**
 * Start a newly registered device session.
 */
function startNewSession(sessionName) {
  startSession(sessionName);
}

/**
 * Stop and remove a session.
 */
async function stopSession(sessionName) {
  // Cancel retry timer if pending
  if (retryTimers.has(sessionName)) {
    clearTimeout(retryTimers.get(sessionName));
    retryTimers.delete(sessionName);
  }
  try {
    const session = getSession(sessionName);
    await session.close();
  } catch (_) {}
}

/**
 * Gracefully shut down all sessions.
 */
async function shutdownAll() {
  const { sessions } = require('../whatsapp/client');
  for (const [name, session] of sessions.entries()) {
    try {
      await session.close();
      logger.info(`[SessionMgr] Closed "${name}"`);
    } catch (_) {}
  }
}

module.exports = { startSession, startNewSession, bootAllDevices, stopSession, shutdownAll };
