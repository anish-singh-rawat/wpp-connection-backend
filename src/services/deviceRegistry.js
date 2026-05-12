'use strict';

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const REGISTRY_PATH = path.resolve(
  process.env.SESSION_PATH || './sessions',
  'device-registry.json'
);

let registry = {};

function load() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
      logger.info(`[Registry] Loaded ${Object.keys(registry).length} device(s)`);
    }
  } catch (err) {
    logger.error(`[Registry] Failed to load registry: ${err.message}`);
    registry = {};
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch (err) {
    logger.error(`[Registry] Failed to save registry: ${err.message}`);
  }
}

function createDevice(label) {
  const token       = uuidv4();
  const sessionName = `device-${token.split('-')[0]}`; 
  const createdAt   = new Date().toISOString();

  registry[token] = { sessionName, label: label || sessionName, createdAt };
  save();

  logger.info(`[Registry] Created device: ${sessionName} (token: ${token})`);
  return { token, sessionName, label: registry[token].label, createdAt };
}

function getDevice(token) {
  if (!token || !registry[token]) return null;
  return { token, ...registry[token] };
}

function listDevices() {
  return Object.entries(registry).map(([token, data]) => ({ token, ...data }));
}

function deleteDevice(token) {
  if (!registry[token]) return false;
  delete registry[token];
  save();
  return true;
}

function resolveSession(token) {
  const device = getDevice(token);
  return device ? device.sessionName : null;
}

load();

module.exports = { createDevice, getDevice, listDevices, deleteDevice, resolveSession };
