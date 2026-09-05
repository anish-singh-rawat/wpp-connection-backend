'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const config = require('../config');
const logger = require('../utils/logger');


function generateToken(user) {
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.role,
    parentCustomerId: user.parentCustomerId,
  };

  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn || '7d',
  });
}

function generateRefreshToken(user) {
  const payload = {
    userId: user._id,
    type: 'refresh',
  };

  return jwt.sign(payload, config.auth.jwtRefreshSecret || config.auth.jwtSecret, {
    expiresIn: config.auth.jwtRefreshExpiresIn || '30d',
  });
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    if (!user.isActive || user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended or inactive.',
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
    }

    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info(`[Auth] User logged in: ${user.email} (${user.role})`);

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          parentCustomerId: user.parentCustomerId,
          isActive: user.isActive,
          status: user.status,
        },
      },
    });
  } catch (err) {
    logger.error(`[Auth] Login error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
    });
  }
}


async function register(req, res) {
  try {
    return res.status(403).json({
      success: false,
      error: 'Self-registration is disabled. Please contact your administrator.',
    });
  } catch (err) {
    logger.error(`[Auth] Register error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Registration failed.',
    });
  }
}

async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -apiTokenHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          parentCustomerId: user.parentCustomerId,
          createdBy: user.createdBy,
          isActive: user.isActive,
          status: user.status,
          apiTokenStatus: user.role === ROLES.CUSTOMER ? user.apiTokenStatus : undefined,
          rateLimit: user.role === ROLES.CUSTOMER ? user.rateLimit : undefined,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (err) {
    logger.error(`[Auth] Get me error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user info.',
    });
  }
}


async function updateProfile(req, res) {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name is required.',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name: name.trim() },
      { new: true, runValidators: true }
    ).select('-password -apiTokenHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }

    logger.info(`[Auth] Profile updated: ${user.email}`);

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user },
    });
  } catch (err) {
    logger.error(`[Auth] Update profile error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile.',
    });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.',
      });
    }

    const user = await User.findById(req.user.userId).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found.',
      });
    }

    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    logger.info(`[Auth] Password changed: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (err) {
    logger.error(`[Auth] Change password error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to change password.',
    });
  }
}

async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(
        refreshToken,
        config.auth.jwtRefreshSecret || config.auth.jwtSecret
      );
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token.',
      });
    }

    const user = await User.findById(decoded.userId).select('-password -apiTokenHash');

    if (!user || !user.isActive || user.status !== 'active') {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive.',
      });
    }

    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.json({
      success: true,
      message: 'Token refreshed successfully.',
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    logger.error(`[Auth] Refresh token error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token.',
    });
  }
}


async function logout(req, res) {
  try {
    logger.info(`[Auth] User logged out: ${req.user?.email || 'Unknown'}`);
    
    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    logger.error(`[Auth] Logout error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Logout failed.',
    });
  }
}

module.exports = {
  login,
  register,
  getMe,
  updateProfile,
  changePassword,
  refreshToken,
  logout,
  generateToken, 
};
