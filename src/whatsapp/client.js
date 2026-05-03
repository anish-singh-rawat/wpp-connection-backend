'use strict';

const wppconnect = require('@wppconnect-team/wppconnect');
const config = require('../config');
const logger = require('../utils/logger');

// Lazy-loaded to avoid circular dependency (client ↔ qrController)
function getNotifiers() {
  return require('../controllers/qrController');
}

class WhatsAppClient {
  constructor(sessionName) {
    this.sessionName = sessionName || config.whatsapp.sessionName;
    this.client      = null;
    this.isReady     = false;
    this.webhookHandlers = [];
    this.latestQR    = null;
    this.status      = 'initialising';
  }

  async init() {
    logger.info(`[WhatsApp] Initialising session: ${this.sessionName}`);
    this.status = 'launching';

    this.client = await wppconnect.create({
      session:         this.sessionName,
      folderNameToken: config.whatsapp.sessionPath,
      headless:        config.whatsapp.headless,
      useChrome:       config.whatsapp.useChrome,
      puppeteerOptions: config.whatsapp.puppeteerOptions,

      // Fires when a new QR code is generated
      catchQR: (base64Qr, _asciiQR, attempts) => {
        this.latestQR = base64Qr;
        this.status   = 'qr_ready';
        logger.info(`[WhatsApp] QR ready (attempt ${attempts}) — open /qrcode in browser`);
        // Push instantly to all open SSE browser connections
        try { getNotifiers().notifyQRUpdate(base64Qr); } catch (_) {}
      },

      statusFind: (statusSession, sessionName) => {
        logger.info(`[WhatsApp] Session "${sessionName}" status: ${statusSession}`);

        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          this.latestQR = null;
          this.status   = 'connected';
          try { getNotifiers().notifyConnected(); } catch (_) {}
        }

        if (statusSession === 'notLogged') {
          // Not logged in — QR will follow via catchQR
          this.status = 'qr_pending';
        }

        if (statusSession === 'browserClose' || statusSession === 'desconnectedMobile') {
          this.status = 'disconnected';
        }
      },

      onLoadingScreen: (percent, message) => {
        logger.info(`[WhatsApp] Loading ${percent}% — ${message}`);
        this.status = `loading (${percent}%)`;
        // Push loading status to SSE clients so browser shows progress
        try {
          getNotifiers().notifyStatus(`loading (${percent}%)`);
        } catch (_) {}
      },
    });

    // wppconnect.create() resolves only after successful login
    this.isReady  = true;
    this.status   = 'connected';
    this.latestQR = null;
    logger.info(`[WhatsApp] Session "${this.sessionName}" is ready.`);

    this._registerIncomingMessageListener();
    return this.client;
  }

  onMessage(handler) {
    this.webhookHandlers.push(handler);
  }

  _registerIncomingMessageListener() {
    if (!this.client) return;
    this.client.onMessage(async (message) => {
      logger.info(`[WhatsApp] Incoming from ${message.from}: ${message.body}`);
      for (const handler of this.webhookHandlers) {
        try { await handler(message); } catch (err) {
          logger.error(`[WhatsApp] Webhook handler error: ${err.message}`);
        }
      }
    });
  }

  async sendText(chatId, message) {
    this._assertReady();
    return this.client.sendText(chatId, message);
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.isReady = false;
      logger.info(`[WhatsApp] Session "${this.sessionName}" closed.`);
    }
  }

  _assertReady() {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp client is not ready. Please scan the QR at /qrcode');
    }
  }
}

// ─── Session registry (multi-session ready) ───────────────────────────────────

const sessions = new Map();

function getSession(name) {
  const key = name || config.whatsapp.sessionName;
  if (!sessions.has(key)) {
    sessions.set(key, new WhatsAppClient(key));
  }
  return sessions.get(key);
}

module.exports = { WhatsAppClient, getSession };
