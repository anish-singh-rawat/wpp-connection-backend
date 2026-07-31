'use strict';

const { v4: uuidv4 } = require('uuid');
const Device = require('../models/Device');
const logger = require('../utils/logger');


async function createDevice(label, ownership = {}) {
  const token       = uuidv4();
  const sessionName = `device-${token.split('-')[0]}`;

  const device = await Device.create({
    token,
    sessionName,
    label: label || sessionName,
    customerId:    ownership.customerId    || null,
    subCustomerId: ownership.subCustomerId || null,
    createdBy:     ownership.createdBy     || null,
  });

  logger.info(`[Registry] Created device: ${device.sessionName} (token: ${token})`);

  return {
    token:         device.token,
    sessionName:   device.sessionName,
    label:         device.label,
    customerId:    device.customerId,
    subCustomerId: device.subCustomerId,
    createdBy:     device.createdBy,
    createdAt:     device.createdAt,
  };
}

async function deleteDevice(token) {
  const result = await Device.deleteOne({ token });
  return result.deletedCount > 0;
}

async function getDevice(token, tenantFilter = null) {
  if (!token) return null;

  const query = { token };

  if (tenantFilter) {
    Object.assign(query, tenantFilter);
  }

  const device = await Device.findOne(query).lean();
  if (!device) return null;

  return {
    token:         device.token,
    sessionName:   device.sessionName,
    label:         device.label,
    customerId:    device.customerId,
    subCustomerId: device.subCustomerId,
    createdBy:     device.createdBy,
    createdAt:     device.createdAt,
  };
}


async function listDevices(tenantFilter = null) {
  const query = tenantFilter || {};
  const devices = await Device.find(query).lean();

  return devices.map((d) => ({
    token:         d.token,
    sessionName:   d.sessionName,
    label:         d.label,
    customerId:    d.customerId,
    subCustomerId: d.subCustomerId,
    createdBy:     d.createdBy,
    createdAt:     d.createdAt,
  }));
}


async function resolveSession(token, tenantFilter = null) {
  const device = await getDevice(token, tenantFilter);
  return device ? device.sessionName : null;
}

module.exports = { createDevice, getDevice, listDevices, deleteDevice, resolveSession };
