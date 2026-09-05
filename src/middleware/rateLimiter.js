'use strict';

const logger = require('../utils/logger');

const rateLimitStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);


function customerRateLimit(req, res, next) {
  if (!req.customer) {
    return next();
  }

  const customerId = req.customer.customerId.toString();
  const limit = req.customer.rateLimit || 100;
  const windowMs = 60 * 1000;

  const now = Date.now();
  const key = customerId;

  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {

    entry = {
      count: 0,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000); 
    
    logger.warn(`[RateLimit] Customer ${req.customer.email} exceeded rate limit: ${entry.count}/${limit}`);

    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': 0,
      'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
      'Retry-After': retryAfter,
    });

    return res.status(429).json({
      success: false,
      error: 'Too many requests. Rate limit exceeded.',
      rateLimit: {
        limit,
        remaining: 0,
        reset: new Date(entry.resetTime).toISOString(),
        retryAfter,
      },
    });
  }

  res.set({
    'X-RateLimit-Limit': limit,
    'X-RateLimit-Remaining': Math.max(0, limit - entry.count),
    'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
  });

  next();
}

function getRateLimitStatus(customerId, rateLimit = 100) {
  const key = customerId.toString();
  const entry = rateLimitStore.get(key);
  const now = Date.now();

  if (!entry || entry.resetTime < now) {
    return {
      limit: rateLimit,
      remaining: rateLimit,
      reset: new Date(now + 60000).toISOString(),
      count: 0,
    };
  }

  return {
    limit: rateLimit,
    remaining: Math.max(0, rateLimit - entry.count),
    reset: new Date(entry.resetTime).toISOString(),
    count: entry.count,
  };
}


function resetRateLimit(customerId) {
  const key = customerId.toString();
  rateLimitStore.delete(key);
  logger.info(`[RateLimit] Reset for customer ${customerId}`);
}

function getAllRateLimits() {
  const now = Date.now();
  const active = [];

  for (const [customerId, entry] of rateLimitStore.entries()) {
    if (entry.resetTime >= now) {
      active.push({
        customerId,
        count: entry.count,
        resetTime: new Date(entry.resetTime).toISOString(),
      });
    }
  }

  return active;
}

module.exports = {
  customerRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  getAllRateLimits,
};
