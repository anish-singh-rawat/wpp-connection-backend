'use strict';

const path   = require('path');
const fs     = require('fs');
const QRCode = require('qrcode');

const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const config = require('../config');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Baileys internal logger — fully suppressed
// ---------------------------------------------------------------------------
const P = require('pino');
const baileysLogger = P({ level: 'silent' });

// ---------------------------------------------------------------------------
// JID normalisation
// Baileys : <number>@s.whatsapp.net
// Our API : <number>@c.us   (kept unchanged for full backward-compat)
// ---------------------------------------------------------------------------
function toJid(chatId) {
  if (!chatId) return chatId;
  return chatId.replace('@c.us', '@s.whatsapp.net');
}

// ---------------------------------------------------------------------------
// WhatsAppClient
// Drop-in replacement for WPPConnect version — same public API & properties.
// ---------------------------------------------------------------------------
class WhatsAppClient {
  constructor(sessionName) {
    this.sessionName     = sessionName;
    this.sock            = null;
    this.isReady         = false;
    this.webhookHandlers = [];
    this.latestQR        = null;
    this.status          = 'initialising';
    this.destroyed       = false;

    // Cached auth state so we can reconnect without re-reading files
    this._state      = null;
    this._saveCreds  = null;
    this._version    = null;

    this.authDir = path.resolve(config.whatsapp.sessionPath, this.sessionName);
  }

  // ── init ───────────────────────────────────────────────────────────────
  async init() {
    logger.info(`[WhatsApp:${this.sessionName}] Initialising (Baileys)...`);
    this.status = 'launching';

    fs.mkdirSync(this.authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    this._state     = state;
    this._saveCreds = saveCreds;

    // Fetch latest WA Web version once — reuse on reconnects
    if (!this._version) {
      try {
        const { version } = await fetchLatestBaileysVersion();
        this._version = version;
        logger.info(`[WhatsApp:${this.sessionName}] WA version: ${version.join('.')}`);
      } catch (_) {
        this._version = [2, 3000, 1015901307];
        logger.warn(`[WhatsApp:${this.sessionName}] Using fallback WA version.`);
      }
    }

    this._openSocket();
  }

  // ── _openSocket ─────────────────────────────────────────────────────────
  // Creates a fresh Baileys socket and attaches all event handlers.
  // Called on first connect AND on every internal reconnect (515, etc.)
  _openSocket() {
    if (this.destroyed) return;

    // Tear down old socket cleanly — without logout (logout = deauth)
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (_) {}
      this.sock = null;
    }

    const sock = makeWASocket({
      version:                      this._version,
      logger:                       baileysLogger,
      auth:                         this._state,
      // Generic browser string — widely compatible, avoids fingerprint bans
      browser:                      ['WhatsApp', 'Chrome', '3.0'],
      printQRInTerminal:            false,
      keepAliveIntervalMs:          25_000,
      retryRequestDelayMs:          2_000,
      markOnlineOnConnect:          false,
      generateHighQualityLinkPreview: false,
      syncFullHistory:              false,
      fireInitQueries:              true,
      // Baileys built-in retry on message failure
      maxMsgRetryCount:             3,
    });

    this.sock = sock;

    // Persist credentials whenever they update
    sock.ev.on('creds.update', this._saveCreds);

    // ── Connection lifecycle ─────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // ── QR available ──────────────────────────────────────────────
      if (qr) {
        try {
          const base64Png   = await QRCode.toDataURL(qr, { scale: 8 });
          this.latestQR     = base64Png;
          this.status       = 'qr_ready';
          this.isReady      = false;
          logger.info(`[WhatsApp:${this.sessionName}] QR ready — scan now`);
          try {
            require('../controllers/qrController')
              .notifyQRUpdateForSession(this.sessionName, base64Png);
          } catch (_) {}
        } catch (err) {
          logger.error(`[WhatsApp:${this.sessionName}] QR generation failed: ${err.message}`);
        }
      }

      // ── Socket connecting ──────────────────────────────────────────
      if (connection === 'connecting') {
        this.status = 'connecting';
        logger.info(`[WhatsApp:${this.sessionName}] Connecting...`);
        try {
          require('../controllers/qrController')
            .notifyStatusForSession(this.sessionName, 'connecting');
        } catch (_) {}
      }

      // ── Socket open / authenticated ────────────────────────────────
      if (connection === 'open') {
        this.isReady  = true;
        this.latestQR = null;
        this.status   = 'connected';
        logger.info(`[WhatsApp:${this.sessionName}] Connected ✓`);
        try {
          require('../controllers/qrController')
            .notifyConnectedForSession(this.sessionName);
        } catch (_) {}
        try {
          require('../services/sessionManager')._onSessionReady(this.sessionName);
        } catch (_) {}
      }

      // ── Socket closed ──────────────────────────────────────────────
      if (connection === 'close') {
        this.isReady  = false;
        this.latestQR = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason     = lastDisconnect?.error?.message || 'unknown';
        logger.warn(
          `[WhatsApp:${this.sessionName}] Closed — code: ${statusCode}, reason: ${reason}`
        );

        if (this.destroyed) {
          this.status = 'disconnected';
          return;
        }

        // ── 401 loggedOut — need fresh QR ─────────────────────────
        if (statusCode === DisconnectReason.loggedOut) {
          logger.warn(`[WhatsApp:${this.sessionName}] Logged out — clearing auth & restarting.`);
          this.status = 'qr_pending';
          this._clearAuth();
          try {
            require('../controllers/qrController')
              .notifyStatusForSession(this.sessionName, 'qr_pending');
          } catch (_) {}
          // Full restart via sessionManager so auth is re-read from disk
          try {
            require('../services/sessionManager').restartSession(this.sessionName);
          } catch (_) {}
          return;
        }

        // ── 515 restartRequired — Baileys internal restart ─────────
        // DO NOT go through sessionManager — just open a new socket directly.
        // Auth state is still valid; we just need a new WebSocket connection.
        if (statusCode === DisconnectReason.restartRequired) {
          logger.info(`[WhatsApp:${this.sessionName}] Restart required — reopening socket...`);
          this.status = 'connecting';
          // Small delay before reconnect to avoid hammering WA servers
          setTimeout(() => this._openSocket(), 1_500);
          return;
        }

        // ── All other codes — reconnect with backoff ───────────────
        this.status = 'retrying';
        try {
          require('../controllers/qrController')
            .notifyStatusForSession(this.sessionName, 'retrying');
        } catch (_) {}
        // Delegate to sessionManager for exponential backoff
        try {
          require('../services/sessionManager').restartSession(this.sessionName);
        } catch (_) {}
      }
    });

    // ── Incoming messages ────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === 'status@broadcast') continue;

        try {
          const contentType = getContentType(msg.message || {});
          const bodyText    = this._extractBody(msg, contentType);
          const from        = (msg.key.remoteJid || '')
            .replace('@s.whatsapp.net', '@c.us');

          const normalised = {
            from,
            body:      bodyText,
            type:      contentType || 'unknown',
            timestamp: msg.messageTimestamp
              ? Number(msg.messageTimestamp)
              : Math.floor(Date.now() / 1000),
          };

          logger.info(`[WhatsApp:${this.sessionName}] Incoming from ${from}`);
          for (const handler of this.webhookHandlers) {
            try { await handler(normalised); } catch (e) {
              logger.error(`[WhatsApp:${this.sessionName}] Handler error: ${e.message}`);
            }
          }
        } catch (err) {
          logger.error(`[WhatsApp:${this.sessionName}] Message processing error: ${err.message}`);
        }
      }
    });
  }

  // ── sendText ─────────────────────────────────────────────────────────────
  async sendText(chatId, message) {
    this._assertReady();
    const jid = toJid(chatId);
    try {
      return await this.sock.sendMessage(jid, { text: message });
    } catch (err) {
      logger.error(`[WhatsApp:${this.sessionName}] sendText failed: ${err.message}`);
      throw err;
    }
  }

  // ── sendMedia ─────────────────────────────────────────────────────────────
  async sendMedia(chatId, fileBuffer, mimeType, filename, caption) {
    this._assertReady();
    const jid     = toJid(chatId);
    const content = this._buildMediaMessage(fileBuffer, mimeType, filename, caption || '');
    try {
      return await this.sock.sendMessage(jid, content);
    } catch (err) {
      logger.error(`[WhatsApp:${this.sessionName}] sendMedia failed: ${err.message}`);
      throw err;
    }
  }

  // ── onMessage ─────────────────────────────────────────────────────────────
  onMessage(handler) {
    this.webhookHandlers.push(handler);
  }

  // ── close ─────────────────────────────────────────────────────────────────
  // Graceful shutdown — does NOT call logout() so credentials remain valid
  async close() {
    this.destroyed = true;
    this.isReady   = false;
    this.status    = 'disconnected';
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);   // close WebSocket only — no deauth
      } catch (_) {}
      this.sock = null;
    }
    logger.info(`[WhatsApp:${this.sessionName}] Closed.`);
  }

  // ── _buildMediaMessage ────────────────────────────────────────────────────
  _buildMediaMessage(buffer, mimeType, filename, caption) {
    if (mimeType === 'image/gif') {
      return { video: buffer, gifPlayback: true, caption, mimetype: mimeType, fileName: filename };
    }
    if (mimeType.startsWith('image/')) {
      return { image: buffer, caption, mimetype: mimeType, fileName: filename };
    }
    if (mimeType.startsWith('video/')) {
      return { video: buffer, caption, mimetype: mimeType, fileName: filename };
    }
    if (mimeType.startsWith('audio/')) {
      return { audio: buffer, mimetype: mimeType, ptt: false };
    }
    // PDF, CSV, Excel, etc.
    return { document: buffer, mimetype: mimeType, fileName: filename, caption };
  }

  // ── _extractBody ──────────────────────────────────────────────────────────
  _extractBody(msg, contentType) {
    if (!msg.message) return '';
    const content = msg.message[contentType];
    if (typeof content === 'string') return content;
    if (content?.text)              return content.text;
    if (content?.caption)           return content.caption;
    if (msg.message.conversation)   return msg.message.conversation;
    return '';
  }

  // ── _clearAuth ────────────────────────────────────────────────────────────
  _clearAuth() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
        logger.info(`[WhatsApp:${this.sessionName}] Auth cleared.`);
      }
    } catch (err) {
      logger.warn(`[WhatsApp:${this.sessionName}] Could not clear auth: ${err.message}`);
    }
  }

  // ── _assertReady ──────────────────────────────────────────────────────────
  _assertReady() {
    if (!this.isReady || !this.sock) {
      throw new Error(
        `Session "${this.sessionName}" is not ready. Scan QR at /devices/{token}/qrcode`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Session registry
// ---------------------------------------------------------------------------
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
