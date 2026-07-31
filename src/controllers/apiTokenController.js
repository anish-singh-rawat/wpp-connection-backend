'use strict';

const User = require('../models/User');
const { ROLES } = require('../models/User');
const logger = require('../utils/logger');

async function resolveTargetCustomer(req) {
  const { role, userId } = req.user;

  if (role === ROLES.SUPER_ADMIN) {
    const { customerId } = req.params;
    if (!customerId) {
      throw Object.assign(new Error('customerId param required.'), { status: 400 });
    }
    const customer = await User.findOne({
      _id: customerId,
      role: ROLES.CUSTOMER,
    }).select('+apiTokenHash');

    if (!customer) {
      throw Object.assign(new Error('Customer not found.'), { status: 404 });
    }
    return customer;
  }

  const customer = await User.findOne({
    _id: userId,
    role: ROLES.CUSTOMER,
  }).select('+apiTokenHash');

  if (!customer) {
    throw Object.assign(new Error('Customer not found.'), { status: 404 });
  }
  return customer;
}

async function generateToken(req, res) {
  try {
    const customer = await resolveTargetCustomer(req);

    const plainToken = User.generateApiToken();
    const tokenHash  = await User.hashApiToken(plainToken);

    customer.apiTokenHash   = tokenHash;
    customer.apiTokenStatus = 'enabled';
    await customer.save();

    logger.info(`[ApiToken] Generated for customer ${customer.email} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'API token generated successfully. Store it safely — it will not be shown again.',
      data: {
        apiToken: plainToken, 
        apiTokenStatus: 'enabled',
        customerId: customer._id,
        customerEmail: customer.email,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[ApiToken] Generate error: ${err.message}`);
    res.status(status).json({ success: false, error: err.message || 'Failed to generate API token.' });
  }
}


async function regenerateToken(req, res) {
  try {
    const customer = await resolveTargetCustomer(req);

    if (!customer.apiTokenHash) {
      return res.status(400).json({
        success: false,
        error: 'No existing API token found. Use generate instead.',
      });
    }

    const plainToken = User.generateApiToken();
    const tokenHash  = await User.hashApiToken(plainToken);

    customer.apiTokenHash   = tokenHash;
    customer.apiTokenStatus = 'enabled';
    await customer.save();

    logger.info(`[ApiToken] Regenerated for customer ${customer.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'API token regenerated successfully. Old token is now invalid. Store the new token safely.',
      data: {
        apiToken: plainToken,
        apiTokenStatus: 'enabled',
        customerId: customer._id,
        customerEmail: customer.email,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[ApiToken] Regenerate error: ${err.message}`);
    res.status(status).json({ success: false, error: err.message || 'Failed to regenerate API token.' });
  }
}


async function enableToken(req, res) {
  try {
    const customer = await resolveTargetCustomer(req);

    if (!customer.apiTokenHash) {
      return res.status(400).json({
        success: false,
        error: 'No API token exists. Generate one first.',
      });
    }

    customer.apiTokenStatus = 'enabled';
    await customer.save();

    logger.info(`[ApiToken] Enabled for customer ${customer.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'API token enabled.',
      data: { apiTokenStatus: 'enabled', customerId: customer._id },
    });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[ApiToken] Enable error: ${err.message}`);
    res.status(status).json({ success: false, error: err.message || 'Failed to enable API token.' });
  }
}


async function disableToken(req, res) {
  try {
    const customer = await resolveTargetCustomer(req);

    if (!customer.apiTokenHash) {
      return res.status(400).json({
        success: false,
        error: 'No API token exists. Generate one first.',
      });
    }

    customer.apiTokenStatus = 'disabled';
    await customer.save();

    logger.info(`[ApiToken] Disabled for customer ${customer.email} by ${req.user.email}`);

    res.json({
      success: true,
      message: 'API token disabled. External applications using this token will be rejected.',
      data: { apiTokenStatus: 'disabled', customerId: customer._id },
    });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[ApiToken] Disable error: ${err.message}`);
    res.status(status).json({ success: false, error: err.message || 'Failed to disable API token.' });
  }
}


async function getTokenInfo(req, res) {
  try {
    const customer = await resolveTargetCustomer(req);

    res.json({
      success: true,
      data: {
        customerId: customer._id,
        customerName: customer.name,
        customerEmail: customer.email,
        apiTokenStatus: customer.apiTokenStatus,
        hasToken: Boolean(customer.apiTokenHash),
        rateLimit: customer.rateLimit,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    logger.error(`[ApiToken] Get info error: ${err.message}`);
    res.status(status).json({ success: false, error: err.message || 'Failed to fetch token info.' });
  }
}


async function listTokens(req, res) {
  try {
    const customers = await User.find({ role: ROLES.CUSTOMER })
      .select('name email apiTokenStatus rateLimit isActive status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const data = customers.map((c) => ({
      customerId: c._id,
      customerName: c.name,
      customerEmail: c.email,
      apiTokenStatus: c.apiTokenStatus,
      rateLimit: c.rateLimit,
      isActive: c.isActive,
      status: c.status,
      createdAt: c.createdAt,
    }));

    res.json({
      success: true,
      data: { tokens: data, total: data.length },
    });
  } catch (err) {
    logger.error(`[ApiToken] List error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to list tokens.' });
  }
}

module.exports = {
  generateToken,
  regenerateToken,
  enableToken,
  disableToken,
  getTokenInfo,
  listTokens,
};
