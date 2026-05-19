'use strict';

const { v4: uuidv4 } = require('uuid');
const Device = require('../models/Device');
const logger = require('../utils/logger');

async function createDevice(label) {
  const token       = uuidv4();
  const sessionName = `device-${token.split('-')[0]}`;

  const device = await Device.create({
    token,
    sessionName,
    label: label || sessionName,
  });

  logger.info(`[Registry] Created device: ${device.sessionName} (token: ${token})`);

  return {
    token:       device.token,
    sessionName: device.sessionName,
    label:       device.label,
    createdAt:   device.createdAt,
  };
}

async function deleteDevice(token) {
  const result = await Device.deleteOne({ token });
  return result.deletedCount > 0;
}


async function getDevice(token) {
  if (!token) return null;
  const device = await Device.findOne({ token }).lean();
  if (!device) return null;
  return {
    token:       device.token,
    sessionName: device.sessionName,
    label:       device.label,
    createdAt:   device.createdAt,
  };
}

async function listDevices() {
  const devices = await Device.find({}).lean();
  return devices.map((d) => ({
    token:       d.token,
    sessionName: d.sessionName,
    label:       d.label,
    createdAt:   d.createdAt,
  }));
}

async function resolveSession(token) {
  const device = await getDevice(token);
  return device ? device.sessionName : null;
}

module.exports = { createDevice, getDevice, listDevices, deleteDevice, resolveSession };
