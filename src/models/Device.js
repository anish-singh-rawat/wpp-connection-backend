'use strict';

const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    token:       { type: String, required: true, unique: true, index: true },
    sessionName: { type: String, required: true, unique: true },
    label:       { type: String, default: '' },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

deviceSchema.index({ customerId: 1, status: 1 });
deviceSchema.index({ customerId: 1, subCustomerId: 1 });
deviceSchema.index({ customerId: 1, token: 1 });

module.exports = mongoose.model('Device', deviceSchema);
