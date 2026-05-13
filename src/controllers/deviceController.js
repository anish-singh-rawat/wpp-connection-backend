'use strict';

const fs = require('fs');
const path = require('path');
const { createDevice, getDevice, listDevices, deleteDevice, resolveSession } = require('../services/deviceRegistry');
const { startNewSession, stopSession } = require('../services/sessionManager');
const { getSession } = require('../whatsapp/client');
const config = require('../config');
const logger = require('../utils/logger');


function createDeviceHandler(req, res) {
  const { label } = req.body;
  const device = createDevice(label);

  startNewSession(device.sessionName);

  logger.info(`[Device] Created: ${device.sessionName}`);

  return res.status(201).json({
    success: true,
    message: 'Device created. Connect to the SSE stream to receive the QR code.',
    device: {
      token:       device.token,
      label:       device.label,
      session:     device.sessionName,
      createdAt:   device.createdAt,
      status:      'launching',
      isReady:     false,
      events_url:  `/devices/${device.token}/qrcode/events`,
      status_url:  `/devices/${device.token}/qrcode/status`,
      image_url:   `/devices/${device.token}/qrcode/image`,
    },
  });
}


function listDevicesHandler(_req, res) {
  const devices = listDevices().map((d) => {
    const session = getSession(d.sessionName);
    return {
      token:      d.token,
      label:      d.label,
      session:    d.sessionName,
      createdAt:  d.createdAt,
      status:     session.status,
      isReady:    session.isReady,
      events_url: `/devices/${d.token}/qrcode/events`,
      status_url: `/devices/${d.token}/qrcode/status`,
      image_url:  `/devices/${d.token}/qrcode/image`,
    };
  });

  return res.json({ success: true, count: devices.length, devices });
}

function getDeviceHandler(req, res) {
  const device = getDevice(req.params.token);
  if (!device) {
    return res.status(404).json({ success: false, error: 'Device not found.' });
  }
  const session = getSession(device.sessionName);
  return res.json({
    success: true,
    device: {
      token:      device.token,
      label:      device.label,
      session:    device.sessionName,
      createdAt:  device.createdAt,
      status:     session.status,
      isReady:    session.isReady,
      events_url: `/devices/${device.token}/qrcode/events`,
      status_url: `/devices/${device.token}/qrcode/status`,
      image_url:  `/devices/${device.token}/qrcode/image`,
    },
  });
}

async function deleteDeviceHandler(req, res) {
  const { token } = req.params;
  const device = getDevice(token);
  if (!device) {
    return res.status(404).json({ success: false, error: 'Device not found.' });
  }

  await stopSession(device.sessionName);

  const sessionFolder = path.resolve(config.whatsapp.sessionPath, device.sessionName);
  try {
    if (fs.existsSync(sessionFolder)) {
      fs.rmSync(sessionFolder, { recursive: true, force: true });
      logger.info(`[Device] Removed session folder: ${sessionFolder}`);
    }
  } catch (err) {
    logger.warn(`[Device] Could not remove session folder "${sessionFolder}": ${err.message}`);
  }

  deleteDevice(token);

  logger.info(`[Device] Deleted: ${device.sessionName}`);
  return res.json({ success: true, message: `Device "${device.label}" removed.` });
}

module.exports = {
  createDeviceHandler,
  listDevicesHandler,
  getDeviceHandler,
  deleteDeviceHandler,
};
