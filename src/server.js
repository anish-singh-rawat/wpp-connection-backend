'use strict';
require('dotenv').config();

const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const compression = require('compression');
const morgan = require('morgan');
const express = require('express');
const mongoose = require('mongoose');

const config = require('./config');
const logger = require('./utils/logger');
const queue = require('./services/messageQueue');
const { bootAllDevices, shutdownAll } = require('./services/sessionManager');
const routes = require('./routes');
const socketManager = require('./services/socketManager');

const app = express();

const allowedOrigins = [
  "https://digiwppconnect-frontend.digibysr.in",
  "https://www.digiwppconnect-frontend.digibysr.in",
  "https://digiwppconnect-backend.digibysr.in",
  "https://visualeye.digibysr.in",
  "https://www.visualeye.digibysr.in",
  "http://visualeye.digibysr.in",
  "http://www.visualeye.digibysr.in",
  "https://visualeyeye.netlify.app",
  "https://www.visualeyeye.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5174",
  "http://139.59.65.108",
  "http://139.59.65.108:3006",
  "http://139.59.65.108:8086",
  "http://168.144.144.141:3000",
  "http://168.144.144.141:3001",
  "http://168.144.144.141:8086",
  "http://168.144.144.141:8080"
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  exposedHeaders: ['x-api-key'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.options('*', cors());

app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "ws://localhost:8086", "wss://localhost:8086", "http://localhost:8086",
        "ws://139.59.65.108:8086", "wss://139.59.65.108:8086",
        "https://digiwppconnect-backend.digibysr.in",
        "wss://digiwppconnect-backend.digibysr.in",
      ],
    },
  },
}));


app.use(compression({
  filter(req, res) {
    if (req.path.endsWith('/events')) return false;
    return compression.filter(req, res);
  },
}));
app.use(morgan('combined'));
app.use(hpp());

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

    logger.info('[Server] Connecting to MongoDB...');
    await mongoose.connect(config.mongodb.uri);
    logger.info('[Server] MongoDB connected.');

    await queue.recoverPendingJobs();

    const server = app.listen(config.server.port, '0.0.0.0', () => {
      logger.info(`[Server] Listening on 0.0.0.0:${config.server.port}`);
    });

    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    socketManager.init(server);

    bootAllDevices();

  } catch (err) {
    logger.error(`[Server] Bootstrap failed: ${err.message}`);
    process.exit(1);
  }
}


async function shutdown(signal) {
  logger.info(`[Server] ${signal} received. Shutting down...`);
  await shutdownAll();
  await mongoose.disconnect();
  logger.info('[Server] MongoDB disconnected.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error(`[Server] Unhandled rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`[Server] Uncaught exception: ${err.message}`);
  process.exit(1);
});

bootstrap();
