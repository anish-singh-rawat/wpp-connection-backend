'use strict';

const path       = require('path');
const fs         = require('fs');
const wppconnect = require('@wppconnect-team/wppconnect');
const config     = require('../config');
const logger     = require('../utils/logger');

function getNotifiers() {
  return require('../controllers/qrController');
}

function isPostSendLookupError(msg) {
  return (
    msg.includes('msgChunks') ||                  
    msg.includes('_out not found') ||             
    msg.includes('findOrCreateLatestChat') ||    
    msg.includes('not found') && msg.includes('@lid') 
  );
}

class WhatsAppClient {
  constructor(sessionName) {
    this.sessionName     = sessionName;
    this.client          = null;
    this.isReady         = false;
    this.webhookHandlers = [];
    this.latestQR        = null;
    this.status          = 'initialising';
    this.destroyed       = false;
    this.qrWasShown      = false;  

    this.sessionFolder = path.resolve(config.whatsapp.sessionPath, this.sessionName);
  }

  async init() {
    logger.info(`[WhatsApp:${this.sessionName}] Initialising... folder: ${this.sessionFolder}`);
    this.status = 'launching';

    const userDataDir = path.join(this.sessionFolder, this.sessionName);

    try {
      const { execSync } = require('child_process');
      execSync(`pkill -9 -f "${userDataDir}" 2>/dev/null || true`, { stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 500)); 
    } catch (_) {}

    for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      try {
        const lockPath = path.join(userDataDir, lockFile);
        if (fs.existsSync(lockPath)) {
          fs.rmSync(lockPath, { force: true });
          logger.info(`[WhatsApp:${this.sessionName}] Removed stale lock: ${lockFile}`);
        }
      } catch (_) {}
    }
    
    const puppeteerOptions = {
      ...config.whatsapp.puppeteerOptions,
      args: [
        ...(config.whatsapp.puppeteerOptions.args || []),
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.178 Safari/537.36',
        '--lang=en-US,en;q=0.9',
      ],
      userDataDir,
    };

    this.client = await wppconnect.create({
      session:          this.sessionName,
      folderNameToken:  this.sessionFolder,
      headless:         config.whatsapp.headless,
      autoClose:        false,     
      useChrome:        config.whatsapp.useChrome,
      logQR:            config.whatsapp.logQR,
      disableWelcome:   true,
      puppeteerOptions,
      browserArgs: [
        '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.178 Safari/537.36',
      ],

      catchQR: (base64Qr, _asciiQR, attempts) => {
        this.latestQR   = base64Qr;
        this.status     = 'qr_ready';
        this.isReady    = false;
        this.qrWasShown = true;   
        logger.info(`[WhatsApp:${this.sessionName}] QR ready (attempt ${attempts})`);
        try {
          getNotifiers().notifyQRUpdateForSession(this.sessionName, base64Qr);
        } catch (_) {}
      },

      statusFind: (statusSession) => {
        logger.info(`[WhatsApp:${this.sessionName}] Status: ${statusSession}`);

        if (statusSession === 'qrReadSuccess') {
          logger.info(`[WhatsApp:${this.sessionName}] QR scanned — waiting for full connection...`);
          this.status = 'connecting';
          try { getNotifiers().notifyStatusForSession(this.sessionName, 'connecting'); } catch (_) {}
          return;
        }

        if (statusSession === 'inChat' || statusSession === 'isLogged') {
          this.latestQR   = null;
          this.status     = 'connected';
          this.isReady    = true;
          this.qrWasShown = true;
          try { getNotifiers().notifyConnectedForSession(this.sessionName); } catch (_) {}
          return;
        }

        if (statusSession === 'notLogged') {
          this.status = 'qr_pending';
          return;
        }

        if (statusSession === 'autocloseCalled') {
          logger.warn(`[WhatsApp:${this.sessionName}] autoClose triggered — restarting session...`);
          this.latestQR = null;
          this.isReady  = false;
          this.status   = 'restarting';
          try {
            if (!this.destroyed) {
              require('../services/sessionManager').startSession(this.sessionName);
            }
          } catch (_) {}
          return;
        }

        if (statusSession === 'desconnectedMobile' || statusSession === 'disconnectedMobile') {
          this.latestQR = null;
          this.isReady  = false;
          this.status   = 'qr_pending';
          try { getNotifiers().notifyStatusForSession(this.sessionName, 'qr_pending'); } catch (_) {}
          return;
        }

        if (statusSession === 'browserClose') {
          this.status  = 'disconnected';
          this.isReady = false;
          this.client  = null;
          try {
            if (!this.destroyed) {
              require('../services/sessionManager').startSession(this.sessionName);
            } else {
              logger.info(`[WhatsApp:${this.sessionName}] Destroyed — skipping restart.`);
            }
          } catch (_) {}
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

    if (this.status !== 'qr_ready' && this.status !== 'qr_pending') {
      this.isReady     = true;
      this.status      = 'connected';
      this.latestQR    = null;
      this.qrWasShown  = true;   
      logger.info(`[WhatsApp:${this.sessionName}] Ready (auto-authenticated).`);
      try { getNotifiers().notifyConnectedForSession(this.sessionName); } catch (_) {}
    } else {
      logger.info(`[WhatsApp:${this.sessionName}] Browser ready — waiting for QR scan (status: ${this.status}).`);
    }

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

    try {
      return await this.client.sendText(chatId, message);
    } catch (err) {
      if (err && err.message && isPostSendLookupError(err.message)) {
        logger.warn(
          `[WhatsApp:${this.sessionName}] sendText to ${chatId} — ` +
          `message delivered but post-send lookup failed (safe to ignore): ${err.message}`
        );
        return { status: 'sent', chatId, note: 'delivered_with_lookup_warning' };
      }
      throw err;
    }
  }

  async close() {
    this.destroyed = true;
    if (this.client) {
      try {
        await this.client.close();
      } catch (_) {}
      this.client  = null;
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

function removeSession(name) {
  sessions.delete(name);
}

module.exports = { WhatsAppClient, getSession, removeSession, sessions };
