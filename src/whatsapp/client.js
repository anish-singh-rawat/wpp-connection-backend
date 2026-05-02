'use strict';

const wppconnect = require('@wppconnect-team/wppconnect');
const config = require('../config');
const logger = require('../utils/logger');


class WhatsAppClient {
  constructor(sessionName) {
    this.sessionName = sessionName || config.whatsapp.sessionName;
    this.client = null;
    this.isReady = false;
    this.webhookHandlers = [];
  }

  async init() {
    logger.info(`[WhatsApp] Initialising session: ${this.sessionName}`);

    this.client = await wppconnect.create({
      session: this.sessionName,
      folderNameToken: config.whatsapp.sessionPath,
      headless: config.whatsapp.headless,
      useChrome: config.whatsapp.useChrome,
      puppeteerOptions: config.whatsapp.puppeteerOptions,

      catchQR: (base64Qr, asciiQR, attempts) => {
        logger.info(`[WhatsApp] QR code generated (attempt ${attempts}). Scan below:\n${asciiQR}`);
      },

      statusFind: (statusSession, session) => {
        logger.info(`[WhatsApp] Session "${session}" status: ${statusSession}`);
      },

      onLoadingScreen: (percent, message) => {
        logger.info(`[WhatsApp] Loading: ${percent}% — ${message}`);
      },
    });

    this.isReady = true;
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
      logger.info(`[WhatsApp] Incoming message from ${message.from}: ${message.body}`);
      for (const handler of this.webhookHandlers) {
        try {
          await handler(message);
        } catch (err) {
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
      throw new Error('WhatsApp client is not ready. Please wait for QR scan.');
    }
  }
}


const sessions = new Map();

function getSession(name) {
  const key = name || config.whatsapp.sessionName;
  if (!sessions.has(key)) {
    sessions.set(key, new WhatsAppClient(key));
  }
  return sessions.get(key);
}

module.exports = { WhatsAppClient, getSession };
