'use strict';

const mongoose = require('mongoose');

const apiRequestLogSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    method: {
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    },
    endpoint: {
      type: String,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },

    sessionName: {
      type: String,
      default: null,
    },
    deviceToken: {
      type: String,
      default: null,
    },

    requestBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: null,
    },

    statusCode: {
      type: Number,
      required: true,
    },
    responseTime: {
      type: Number,
      required: true,
    },
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },

    authMethod: {
      type: String,
      enum: ['api_token', 'jwt', 'none'],
      default: 'api_token',
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);


apiRequestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

apiRequestLogSchema.index({ customerId: 1, createdAt: -1 });
apiRequestLogSchema.index({ customerId: 1, endpoint: 1, createdAt: -1 });
apiRequestLogSchema.index({ customerId: 1, statusCode: 1, createdAt: -1 });
apiRequestLogSchema.index({ customerId: 1, subCustomerId: 1, createdAt: -1 });

apiRequestLogSchema.index({ authMethod: 1, createdAt: -1 });

apiRequestLogSchema.index({ ipAddress: 1, createdAt: -1 });

module.exports = mongoose.model('ApiRequestLog', apiRequestLogSchema);
