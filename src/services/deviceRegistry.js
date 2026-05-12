'use strict';

/**
 * Device Registry
 * ───────────────
 * Manages the mapping of secret tokens → session names.
 * Persisted to disk as JSON so devices survive server restarts.
 *
 * Registry file format:
 * {
 *   "<token>": {
 *     "sessionName": "device-<token-prefix>",
 *     "label": "My iPhone",
 *     "createdAt": "2026-01-01T00:00:00.000Z"
 *   }
 * }
 */

const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const REGISTRY_PATH = path.resolve(
  process.env.SESSION_PATH || './sessions',
  'device-registry.json'
);

// In-memory cache
let registry = {};

// ─── Persistence ──────────────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new device entry and return its secret token.
 * @param {string} [label] - optional human-readable label
 * @returns {{ token: string, sessionName: string, label: string, createdAt: string }}
 */
function createDevice(label) {
  const token       = uuidv4();
  const sessionName = `device-${token.split('-')[0]}`; // e.g. device-a1b2c3d4
  const createdAt   = new Date().toISOString();

  registry[token] = { sessionName, label: label || sessionName, createdAt };
  save();

  logger.info(`[Registry] Created device: ${sessionName} (token: ${token})`);
  return { token, sessionName, label: registry[token].label, createdAt };
}

/**
 * Look up a device by its secret token.
 * @param {string} token
 * @returns {{ token, sessionName, label, createdAt } | null}
 */
function getDevice(token) {
  if (!token || !registry[token]) return null;
  return { token, ...registry[token] };
}

/**
 * List all registered devices (tokens are included — admin only endpoint).
 */
function listDevices() {
  return Object.entries(registry).map(([token, data]) => ({ token, ...data }));
}

/**
 * Delete a device by token.
 */
function deleteDevice(token) {
  if (!registry[token]) return false;
  delete registry[token];
  save();
  return true;
}

/**
 * Validate a token and return the session name, or null if invalid.
 */
function resolveSession(token) {
  const device = getDevice(token);
  return device ? device.sessionName : null;
}

// Load on startup
load();

module.exports = { createDevice, getDevice, listDevices, deleteDevice, resolveSession };
