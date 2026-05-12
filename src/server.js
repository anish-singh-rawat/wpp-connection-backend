'use strict';

require('dotenv').config();

const express = require('express');
const config  = require('./config');
const logger  = require('./utils/logger');
const { bootAllDevices, shutdownAll } = require('./services/sessionManager');
const routes  = require('./routes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, _res, next) => {
  logger.info(`[HTTP] ${req.method} ${req.path}`);
  next();
});

app.use('/', routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found.' });
});

app.use((err, _req, res, _next) => {
  logger.error(`[Server] Unhandled error: ${err.message}`);
  const message = config.server.env === 'production' ? 'Internal server error.' : err.message;
  res.status(err.status || 500).json({ success: false, error: message });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    logger.info(`[Server] Environment: ${config.server.env}`);

    const server = app.listen(config.server.port, '0.0.0.0', () => {
      logger.info(`[Server] Listening on 0.0.0.0:${config.server.port}`);
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout   = 66000;

    // Boot all previously registered devices in background
    bootAllDevices();

  } catch (err) {
    logger.error(`[Server] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info(`[Server] ${signal} received. Shutting down...`);
  await shutdownAll();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error(`[Server] Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[Server] Uncaught exception: ${err.message}`);
  process.exit(1);
});

bootstrap();
