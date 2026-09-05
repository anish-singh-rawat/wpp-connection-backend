'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CUSTOMER: 'CUSTOMER',
  SUB_CUSTOMER: 'SUB_CUSTOMER',
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      index: true,
    },
    parentCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    apiTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    apiTokenStatus: {
      type: String,
      enum: ['enabled', 'disabled'],
      default: 'enabled',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
    },
    rateLimit: {
      type: Number,
      default: 100, 
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.compareApiToken = async function (candidateToken) {
  if (!this.apiTokenHash) return false;
  return bcrypt.compare(candidateToken, this.apiTokenHash);
};

userSchema.statics.generateApiToken = function () {
  const crypto = require('crypto');

  const token = 'wpp_' + crypto.randomBytes(48).toString('hex');
  return token;
};

userSchema.statics.hashApiToken = async function (token) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(token, salt);
};

userSchema.index({ createdBy: 1 });
userSchema.index({ isActive: 1, status: 1 });
userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
