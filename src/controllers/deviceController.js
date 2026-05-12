'use strict';

const { createDevice, getDevice, listDevices, deleteDevice, resolveSession } = require('../services/deviceRegistry');
const { startNewSession, stopSession } = require('../services/sessionManager');
const { getSession } = require('../whatsapp/client');
const logger = require('../utils/logger');


function createDeviceHandler(req, res) {
  const { label } = req.body;
  const device = createDevice(label);

  startNewSession(device.sessionName);

  logger.info(`[Device] Created: ${device.sessionName}`);

  return res.status(201).json({
    success: true,
    message: 'Device created. Open the qrcode_url in your browser to scan.',
    device: {
      token:      device.token,
      label:      device.label,
      session:    device.sessionName,
      createdAt:  device.createdAt,
      qrcode_url: `/devices/${device.token}/qrcode`,
      status_url: `/devices/${device.token}/qrcode/status`,
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
      qrcode_url: `/devices/${d.token}/qrcode`,
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
      token:     device.token,
      label:     device.label,
      session:   device.sessionName,
      createdAt: device.createdAt,
      status:    session.status,
      isReady:   session.isReady,
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
