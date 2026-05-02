'use strict';

const config = {
  server: {
    port: process.env.PORT || 3000,
  },

  whatsapp: {
    sessionName: process.env.WA_SESSION || 'default-session',
    sessionPath: './sessions',
    headless: true,
    useChrome: false,
    // Puppeteer args for server environments
    puppeteerOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  },

  messaging: {
    // Delay range between messages in ms (anti-ban)
    minDelay: 5000,
    maxDelay: 10000,
    // Max retries per failed message
    maxRetries: 2,
    // Delay between retries in ms
    retryDelay: 3000,
  },

  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,             // max requests per window
  },
};

module.exports = config;
