'use strict';

const mongoose = require('mongoose');

const messageJobSchema = new mongoose.Schema(
  {
    _id:         { type: String },       
    dedupKey:    { type: String, index: true },
    sessionName: { type: String, required: true, index: true },
    number:      { type: String, required: true },
    chatId:      { type: String, required: true },
    message:     { type: String, default: null },  // optional for media-only jobs
    // media fields
    mediaData:   { type: String, default: null },   // base64 data URI
    mimeType:    { type: String, default: null },
    filename:    { type: String, default: null },
    // optional CSV personalisation fields
    name:        { type: String, default: null },
    title:       { type: String, default: null },
    city:        { type: String, default: null },
    // job lifecycle
    status: {
      type:    String,
      enum:    ['pending', 'sending', 'sent', 'failed', 'duplicate', 'skipped'],
      default: 'pending',
      index:   true,
    },
    attempts:    { type: Number, default: 0 },
    error:       { type: String, default: null },
    enqueuedAt:  { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  {
    _id:        false,   
    versionKey: false,
    timestamps: false,
  }
);

// Compound index for dedup lookups
messageJobSchema.index({ dedupKey: 1, status: 1 });

module.exports = mongoose.model('MessageJob', messageJobSchema);
