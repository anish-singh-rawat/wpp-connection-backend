'use strict';

const path       = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');
const config     = require('../config');
const logger     = require('../utils/logger');

function getNotifiers() {
  return require('../controllers/qrController');
}

class WhatsAppClient {
  constructor(sessionName) {
    this.sessionName     = sessionName;
    this.client          = null;
    this.isReady         = false;
    this.webhookHandlers = [];
    this.latestQR        = null;
    this.status          = 'initialising';

    this.sessionFolder = path.resolve(config.whatsapp.sessionPath, this.sessionName);
  }

  async init() {
    logger.info(`[WhatsApp:${this.sessionName}] Initialising... folder: ${this.sessionFolder}`);
    this.status = 'launching';

    this.client = await wppconnect.create({
      session:          this.sessionName,
      folderNameToken:  this.sessionFolder, 
      headless:         config.whatsapp.headless,
      autoClose:        config.whatsapp.autoClose,
      useChrome:        config.whatsapp.useChrome,
      logQR:            config.whatsapp.logQR,
      puppeteerOptions: config.whatsapp.puppeteerOptions,

      catchQR: (base64Qr, _asciiQR, attempts) => {
        this.latestQR = base64Qr;
        this.status   = 'qr_ready';
        logger.info(`[WhatsApp:${this.sessionName}] QR ready (attempt ${attempts})`);
        try {
          getNotifiers().notifyQRUpdateForSession(this.sessionName, base64Qr);
        } catch (_) {}
      },

      statusFind: (statusSession) => {
        logger.info(`[WhatsApp:${this.sessionName}] Status: ${statusSession}`);

        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          this.latestQR = null;
          this.status   = 'connected';
          try { getNotifiers().notifyConnectedForSession(this.sessionName); } catch (_) {}
        }
        if (statusSession === 'notLogged') {
          this.status = 'qr_pending';
        }
        if (statusSession === 'browserClose' || statusSession === 'desconnectedMobile') {
          this.status = 'disconnected';
        }
      },

      onLoadingScreen: (percent, message) => {
        logger.info(`[WhatsApp:${this.sessionName}] Loading ${percent}% — ${message}`);
        this.status = `loading (${percent}%)`;
        try {
          getNotifiers().notifyStatusForSession(this.sessionName, `loading (${percent}%)`);
        } catch (_) {}
      },
    });

    this.isReady  = true;
    this.status   = 'connected';
    this.latestQR = null;
    logger.info(`[WhatsApp:${this.sessionName}] Ready.`);

    this._registerIncomingMessageListener();
    return this.client;
  }

  onMessage(handler) {
    this.webhookHandlers.push(handler);
  }

  _registerIncomingMessageListener() {
    if (!this.client) return;
    this.client.onMessage(async (message) => {
      logger.info(`[WhatsApp:${this.sessionName}] Incoming from ${message.from}`);
      for (const handler of this.webhookHandlers) {
        try { await handler(message); } catch (err) {
          logger.error(`[WhatsApp:${this.sessionName}] Handler error: ${err.message}`);
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
      logger.info(`[WhatsApp:${this.sessionName}] Closed.`);
    }
  }

  _assertReady() {
    if (!this.isReady || !this.client) {
      throw new Error(`Session "${this.sessionName}" is not ready. Scan QR at /devices/{token}/qrcode`);
    }
  }
}


const sessions = new Map();

function getSession(name) {
  if (!sessions.has(name)) {
    sessions.set(name, new WhatsAppClient(name));
  }
  return sessions.get(name);
}

module.exports = { WhatsAppClient, getSession, sessions };
