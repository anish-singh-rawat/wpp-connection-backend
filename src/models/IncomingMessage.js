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
  },
  {
    versionKey: false,
    timestamps: false,
  }
);

// TTL index: auto-delete messages older than 30 days (2592000 seconds)
// incomingMessageSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('IncomingMessage', incomingMessageSchema);
