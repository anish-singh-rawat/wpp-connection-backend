'use strict';

const mongoose = require('mongoose');

const incomingMessageSchema = new mongoose.Schema(
  {
    sessionName: { type: String, required: true, index: true },
    from:        { type: String, required: true },
    body:        { type: String, default: '' },
    type:        { type: String, default: 'chat' },
    timestamp:   { type: Date },
    receivedAt:  { type: Date, default: Date.now },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    subCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    deviceToken: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

incomingMessageSchema.index({ customerId: 1, receivedAt: -1 });
incomingMessageSchema.index({ customerId: 1, sessionName: 1, receivedAt: -1 });
incomingMessageSchema.index({ customerId: 1, subCustomerId: 1, receivedAt: -1 });

// Optional TTL: auto-delete messages older than 90 days
incomingMessageSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model('IncomingMessage', incomingMessageSchema);
