'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');

async function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. JWT token required.',
      });
    }

    const token = authHeader.substring(7); 

    let decoded;
    try {
      decoded = jwt.verify(token, config.auth.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please login again.',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token.',
      });
    }

    const user = await User.findById(decoded.userId).select('-password -apiTokenHash');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found.',
      });
    }

    if (!user.isActive || user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account suspended or inactive.',
      });
    }

    req.user = {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      parentCustomerId: user.parentCustomerId,
      createdBy: user.createdBy,
      isActive: user.isActive,
      status: user.status,
    };

    next();
  } catch (err) {
    logger.error(`[Auth] JWT authentication error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.',
    });
  }
}


async function authenticateApiToken(req, res, next) {
  try {
    let apiToken = null;
    
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiToken = authHeader.substring(7);
    } else if (req.headers['x-api-key']) {
      apiToken = req.headers['x-api-key'];
    } else if (req.query.api_key) {
      apiToken = req.query.api_key;
    }

    if (!apiToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. API token required.',
      });
    }

    if (!apiToken.startsWith('wpp_')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API token format.',
      });
    }

    const customers = await User.find({
      role: 'CUSTOMER',
      apiTokenStatus: 'enabled',
      isActive: true,
      status: 'active',
    }).select('+apiTokenHash');

    let matchedCustomer = null;
    for (const customer of customers) {
      if (customer.apiTokenHash) {
        const isMatch = await customer.compareApiToken(apiToken);
        if (isMatch) {
          matchedCustomer = customer;
          break;
        }
      }
    }

    if (!matchedCustomer) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or disabled API token.',
      });
    }

    req.customer = {
      customerId: matchedCustomer._id,
      email: matchedCustomer.email,
      name: matchedCustomer.name,
      role: matchedCustomer.role,
      rateLimit: matchedCustomer.rateLimit,
      isActive: matchedCustomer.isActive,
      status: matchedCustomer.status,
    };

    req.user = {
      userId: matchedCustomer._id,
      email: matchedCustomer.email,
      name: matchedCustomer.name,
      role: matchedCustomer.role,
      parentCustomerId: null,
      isActive: matchedCustomer.isActive,
      status: matchedCustomer.status,
    };

    next();
  } catch (err) {
    logger.error(`[Auth] API token authentication error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed.',
    });
  }
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const hasJWT = authHeader && authHeader.startsWith('Bearer ') && !authHeader.substring(7).startsWith('wpp_');
  
  if (hasJWT) {
    return authenticateJWT(req, res, next);
  } else {
    return authenticateApiToken(req, res, next);
  }
}

async function optionalJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    const user = await User.findById(decoded.userId).select('-password -apiTokenHash');

    if (user && user.isActive && user.status === 'active') {
      req.user = {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        parentCustomerId: user.parentCustomerId,
        createdBy: user.createdBy,
        isActive: user.isActive,
        status: user.status,
      };
    }

    next();
  } catch (err) {
    next();
  }
}

async function authenticateQR(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let rawToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!rawToken) {
      rawToken = req.query.token || null;
    }

    if (!rawToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Token required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(rawToken, config.auth.jwtSecret);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }

    const user = await User.findById(decoded.userId).select('-password -apiTokenHash');
    if (!user || !user.isActive || user.status !== 'active') {
      return res.status(401).json({ success: false, error: 'User not found or inactive.' });
    }

    req.user = {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      parentCustomerId: user.parentCustomerId,
      createdBy: user.createdBy,
      isActive: user.isActive,
      status: user.status,
    };

    next();
  } catch (err) {
    logger.error(`[Auth] QR authentication error: ${err.message}`);
    return res.status(500).json({ success: false, error: 'Authentication failed.' });
  }
}

module.exports = {
  authenticateJWT,
  authenticateApiToken,
  authenticate,
  optionalJWT,
  authenticateQR,
};
