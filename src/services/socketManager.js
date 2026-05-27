'use strict';
const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../utils/logger');

let io = null;

const allowedOrigins = [
  // Production
  'https://digiwppconnect-frontend.digibysr.in',
  'https://digiwppconnect-backend.digibysr.in',
  // Legacy / other projects
  'https://visualeye.digibysr.in',
  'https://www.visualeye.digibysr.in',
  'http://visualeye.digibysr.in',
  'http://www.visualeye.digibysr.in',
  'https://visualeyeye.netlify.app',
  'https://www.visualeyeye.netlify.app',
  // Local dev
  'http://localhost:5173',
  'http://localhost:5174',
  'http://139.59.65.108',
  'http://139.59.65.108:3006',
  'http://139.59.65.108:8086',
];

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    if (!config.auth.apiKey) return next();
    const key =
      socket.handshake.auth?.apiKey ||
      socket.handshake.headers?.['x-api-key'] ||
      socket.handshake.query?.api_key;
    if (key === config.auth.apiKey) return next();
    logger.warn(`[Socket] Rejected connection from ${socket.handshake.address} — bad API key`);
    return next(new Error('Unauthorized'));
  });

  io.on('connection', (socket) => {
    logger.info(`[Socket] Client connected: ${socket.id}`);
    socket.on('join:device', (token) => {
      if (typeof token === 'string' && token.length > 0) {
        socket.join(`device:${token}`);
        logger.info(`[Socket] ${socket.id} joined room device:${token}`);
      }
    });

    socket.on('leave:device', (token) => {
      socket.leave(`device:${token}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('[Socket] Socket.IO initialised.');
  return io;
}

function getIO() {
  if (!io) throw new Error('[Socket] Not initialised. Call socketManager.init(httpServer) first.');
  return io;
}

function broadcast(event, data) {
  if (!io) return;
  io.emit(event, data);
}

function emitToDevice(token, event, data) {
  if (!io) return;
  io.to(`device:${token}`).emit(event, data);
}

function emitDeviceStatus(token, sessionName, status, isReady) {
  broadcast('device:status', { token, sessionName, status, isReady });
}

function emitDeviceQR(token, sessionName, qr) {
  broadcast('device:qr', { token, sessionName, qr });
  emitToDevice(token, 'device:qr', { token, sessionName, qr });
}

function emitDeviceConnected(token, sessionName) {
  broadcast('device:connected', { token, sessionName });
}

function emitDevicesUpdate() {
  broadcast('devices:update', {});
}

function emitHealth(data) {
  broadcast('health', data);
}

function emitQueueJob(sessionName, job) {
  broadcast('queue:job', { sessionName, job });
}

function emitQueueUpdate(sessionName, jobs) {
  broadcast('queue:update', { sessionName, jobs });
}

function emitInboxMessage(sessionName, message) {
  broadcast('inbox:message', { sessionName, message });
}

module.exports = {
  init,
  getIO,
  broadcast,
  emitToDevice,
  emitDeviceStatus,
  emitDeviceQR,
  emitDeviceConnected,
  emitDevicesUpdate,
  emitHealth,
  emitQueueJob,
  emitQueueUpdate,
  emitInboxMessage,
};
