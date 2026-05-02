'use strict';

const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { getSession } = require('./whatsapp/client');
const { registerIncomingListener } = require('./controllers/webhookController');
const routes = require('./routes');

const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/', routes);


app.use((err, _req, res, _next) => {
  logger.error(`[Server] Unhandled error: ${err.message}`);
  res.status(err.status || 500).json({ success: false, error: err.message });
});


async function bootstrap() {
  try {
    logger.info('[Server] Starting WhatsApp session...');

    const session = getSession();
    await session.init();

    registerIncomingListener();

    app.listen(config.server.port, () => {
      logger.info(`[Server] HTTP server listening on port ${config.server.port}`);
    });
  } catch (err) {
    logger.error(`[Server] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}


async function shutdown(signal) {
  logger.info(`[Server] Received ${signal}. Shutting down gracefully...`);
  try {
    const session = getSession();
    await session.close();
  } catch (err) {
    console.log("error:", err);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();
