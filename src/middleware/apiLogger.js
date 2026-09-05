'use strict';

const ApiRequestLog = require('../models/ApiRequestLog');
const logger = require('../utils/logger');


function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return null;

  const sanitized = { ...body };
  

  const sensitiveFields = [
    'password',
    'currentPassword',
    'newPassword',
    'apiToken',
    'token',
    'refreshToken',
    'apiKey',
    'api_key',
    'secret',
    'authorization',
  ];

  sensitiveFields.forEach((field) => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });


  const bodyStr = JSON.stringify(sanitized);
  if (bodyStr.length > 5000) {
    return { _note: 'Body too large, truncated', preview: bodyStr.substring(0, 500) + '...' };
  }

  return sanitized;
}


function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function logApiRequest(req, res, next) {

  if (!req.customer && !req.user) {
    return next();
  }

  const startTime = Date.now();


  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  let isLogged = false;

  async function logRequest(statusCode, success, errorMessage = null) {
    if (isLogged) return; 
    isLogged = true;

    const responseTime = Date.now() - startTime;

    try {
      const logEntry = {
        customerId: req.customer?.customerId || req.user?.userId,
        subCustomerId: req.user?.role === 'SUB_CUSTOMER' ? req.user.userId : null,
        method: req.method,
        endpoint: req.route?.path || req.path,
        path: req.originalUrl || req.url,
        sessionName: req.device?.sessionName || null,
        deviceToken: req.params?.token || null,
        requestBody: sanitizeBody(req.body),
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || null,
        statusCode,
        responseTime,
        success,
        errorMessage,
        authMethod: req.customer ? 'api_token' : 'jwt',
        createdAt: new Date(),
      };

    
      ApiRequestLog.create(logEntry).catch((err) => {
        logger.error(`[ApiLogger] Failed to save log: ${err.message}`);
      });
    } catch (err) {
      logger.error(`[ApiLogger] Logging error: ${err.message}`);
    }
  }


  res.json = function (body) {
    const statusCode = res.statusCode || 200;
    const success = statusCode >= 200 && statusCode < 400;
    const errorMessage = !success && body?.error ? body.error : null;
    
    logRequest(statusCode, success, errorMessage);
    return originalJson(body);
  };


  res.send = function (body) {
    const statusCode = res.statusCode || 200;
    const success = statusCode >= 200 && statusCode < 400;
    
    logRequest(statusCode, success);
    return originalSend(body);
  };


  res.on('finish', () => {
    if (!isLogged) {
      const statusCode = res.statusCode || 500;
      const success = statusCode >= 200 && statusCode < 400;
      logRequest(statusCode, success);
    }
  });

  next();
}


async function getRequestLogs(customerId, options = {}) {
  const {
    page = 1,
    limit = 100,
    startDate,
    endDate,
    endpoint,
    statusCode,
    method,
    subCustomerId,
  } = options;

  const skip = (page - 1) * limit;

  const filter = { customerId };

  if (subCustomerId) {
    filter.subCustomerId = subCustomerId;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (endpoint) {
    filter.endpoint = { $regex: endpoint, $options: 'i' };
  }

  if (statusCode) {
    filter.statusCode = parseInt(statusCode);
  }

  if (method) {
    filter.method = method.toUpperCase();
  }

  const [logs, total] = await Promise.all([
    ApiRequestLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ApiRequestLog.countDocuments(filter),
  ]);

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

async function getUsageStats(customerId, options = {}) {
  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 
    endDate = new Date(),
  } = options;

  const filter = {
    customerId,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  const [
    totalRequests,
    successfulRequests,
    failedRequests,
    avgResponseTime,
    requestsByEndpoint,
    requestsByDay,
  ] = await Promise.all([
  
    ApiRequestLog.countDocuments(filter),

  
    ApiRequestLog.countDocuments({ ...filter, success: true }),

  
    ApiRequestLog.countDocuments({ ...filter, success: false }),

  
    ApiRequestLog.aggregate([
      { $match: filter },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } },
    ]),

  
    ApiRequestLog.aggregate([
      { $match: filter },
      { $group: { _id: '$endpoint', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

  
    ApiRequestLog.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    totalRequests,
    successfulRequests,
    failedRequests,
    successRate: totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(2) : 0,
    avgResponseTime: avgResponseTime[0]?.avgTime?.toFixed(2) || 0,
    requestsByEndpoint,
    requestsByDay,
  };
}

module.exports = {
  logApiRequest,
  getRequestLogs,
  getUsageStats,
  sanitizeBody,
  getClientIp,
};
