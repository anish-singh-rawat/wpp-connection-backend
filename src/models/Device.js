'use strict';

const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    token:       { type: String, required: true, unique: true, index: true },
    sessionName: { type: String, required: true, unique: true },
    label:       { type: String, default: '' },
  },
  {
    timestamps: true, 
    versionKey: false,
  }
);

module.exports = mongoose.model('Device', deviceSchema);
