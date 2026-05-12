'use strict';
require('dotenv').config();

const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const morgan = require('morgan');
const express = require('express');
const config  = require('./config');
const logger  = require('./utils/logger');
const { bootAllDevices, shutdownAll } = require('./services/sessionManager');
const routes  = require('./routes');

const app = express();

const allowedOrigins = [
  "https://visualeye.digibysr.in",
  "https://www.visualeye.digibysr.in",
  "http://visualeye.digibysr.in",
  "http://www.visualeye.digibysr.in",
  "https://visualeyeye.netlify.app",
  "https://www.visualeyeye.netlify.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://139.59.65.108",
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}));

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression()); 
app.use(morgan('combined'));
app.use(hpp()); 
app.use(cookieParser())

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


async function bootstrap() {
  try {
    logger.info(`[Server] Environment: ${config.server.env}`);

    const server = app.listen(config.server.port, '0.0.0.0', () => {
      logger.info(`[Server] Listening on 0.0.0.0:${config.server.port}`);
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout   = 66000;
    bootAllDevices();

  } catch (err) {
    logger.error(`[Server] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}


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
