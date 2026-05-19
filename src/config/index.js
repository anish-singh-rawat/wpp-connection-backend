'use strict';

if (process.env.NODE_ENV === 'production') {
  const required = ['API_KEY', 'MONGODB_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[Config] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 8086,
    env: process.env.NODE_ENV || 'development',
  },

  mongodb: {
    uri: process.env.MONGODB_URL || 'mongodb://localhost:27017/wp-system',
  },

  auth: {
    apiKey: process.env.API_KEY || null,
  },

  whatsapp: {
    sessionName: process.env.WA_SESSION || 'default-session',
    sessionPath: process.env.SESSION_PATH || './sessions',
    headless: true,
    autoClose: 0,
    useChrome: false,
    logQR: false,
    puppeteerOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      protocolTimeout: 120000,
      timeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--safebrowsing-disable-auto-update',
        '--window-size=1280,720',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    },
  },

  messaging: {
    minDelay: parseInt(process.env.MSG_MIN_DELAY, 10) || 5000,
    maxDelay: parseInt(process.env.MSG_MAX_DELAY, 10) || 10000,
    maxRetries: parseInt(process.env.MSG_MAX_RETRIES, 10) || 2,
    retryDelay: parseInt(process.env.MSG_RETRY_DELAY, 10) || 3000,
  },

  rateLimit: {
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,
  },
};

module.exports = config;
