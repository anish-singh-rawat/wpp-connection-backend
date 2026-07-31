'use strict';

const logger = require('../utils/logger');
const config = require('../config');


class ApiError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; 
    Error.captureStackTrace(this, this.constructor);
  }
}


const errors = {
  badRequest: (message = 'Bad request.', details = null) =>
    new ApiError(message, 400, details),

  unauthorized: (message = 'Unauthorized. Authentication required.') =>
    new ApiError(message, 401),

  forbidden: (message = 'Forbidden. Insufficient permissions.') =>
    new ApiError(message, 403),

  notFound: (message = 'Resource not found.') =>
    new ApiError(message, 404),

  conflict: (message = 'Conflict. Resource already exists.') =>
    new ApiError(message, 409),

  unprocessableEntity: (message = 'Validation failed.', details = null) =>
    new ApiError(message, 422, details),

  tooManyRequests: (message = 'Too many requests. Rate limit exceeded.') =>
    new ApiError(message, 429),

  internal: (message = 'Internal server error.') =>
    new ApiError(message, 500),

  serviceUnavailable: (message = 'Service temporarily unavailable.') =>
    new ApiError(message, 503),
};


function errorHandler(err, req, res, next) {

  if (res.headersSent) {
    return next(err);
  }


  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;


  if (statusCode >= 500) {
    logger.error(`[Error] ${err.message}`, {
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.userId,
      customerId: req.customer?.customerId,
    });
  } else if (statusCode >= 400) {
    logger.warn(`[Error] ${statusCode} ${err.message} - ${req.method} ${req.originalUrl}`);
  }


  let message = err.message || 'Internal server error.';
  

  if (config.server.env === 'production' && statusCode >= 500 && !isOperational) {
    message = 'An unexpected error occurred. Please try again later.';
  }


  const errorResponse = {
    success: false,
    error: message,
  };


  if (err.details) {
    errorResponse.details = err.details;
  }


  if (config.server.env === 'development' && err.stack) {
    errorResponse.stack = err.stack.split('\n').slice(0, 5); 
  }


  if (req.id) {
    errorResponse.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
}

function notFoundHandler(req, res) {
  logger.warn(`[404] ${req.method} ${req.originalUrl} - Route not found`);
  
  res.status(404).json({
    success: false,
    error: 'Route not found.',
    path: req.originalUrl,
    method: req.method,
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function formatValidationErrors(errors) {
  if (Array.isArray(errors)) {
    return errors.map((err) => ({
      field: err.param || err.path,
      message: err.msg || err.message,
    }));
  }

  if (errors.errors) {
  
    return Object.keys(errors.errors).map((key) => ({
      field: key,
      message: errors.errors[key].message,
    }));
  }

  return null;
}


function handleMongoError(err) {

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return new ApiError(`Duplicate value for ${field}.`, 409);
  }


  if (err.name === 'ValidationError') {
    const details = formatValidationErrors(err);
    return new ApiError('Validation failed.', 422, details);
  }


  if (err.name === 'CastError') {
    return new ApiError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  return err;
}

function globalErrorHandler(err, req, res, next) {

  if (err.name === 'MongoError' || err.name === 'ValidationError' || err.name === 'CastError') {
    err = handleMongoError(err);
  }


  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      err = new ApiError('File too large. Maximum size is 16MB.', 413);
    } else {
      err = new ApiError(`File upload error: ${err.message}`, 400);
    }
  }


  if (err.name === 'JsonWebTokenError') {
    err = new ApiError('Invalid token.', 401);
  }

  if (err.name === 'TokenExpiredError') {
    err = new ApiError('Token expired.', 401);
  }


  errorHandler(err, req, res, next);
}

module.exports = {
  ApiError,
  errors,
  errorHandler,
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  formatValidationErrors,
  handleMongoError,
};
