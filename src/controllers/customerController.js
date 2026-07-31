'use strict';

const User = require('../models/User');
const { ROLES } = require('../models/User');
const { generateToken } = require('./authController');
const logger = require('../utils/logger');


async function createCustomer(req, res) {
  try {
    const { name, email, password, rateLimit } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.',
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists.',
      });
    }

    const apiToken = User.generateApiToken();
    const apiTokenHash = await User.hashApiToken(apiToken);

    const customer = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: ROLES.CUSTOMER,
      parentCustomerId: null,
      createdBy: req.user.userId,
      apiTokenHash,
      apiTokenStatus: 'enabled',
      isActive: true,
      status: 'active',
      rateLimit: rateLimit || 100,
    });

    logger.info(`[Customer] Created by ${req.user.email}: ${customer.email}`);

    res.status(201).json({
      success: true,
      message: 'Customer created successfully.',
      data: {
        customer: {
          id: customer._id,
          name: customer.name,
          email: customer.email,
          role: customer.role,
          apiTokenStatus: customer.apiTokenStatus,
          rateLimit: customer.rateLimit,
          isActive: customer.isActive,
          status: customer.status,
          createdAt: customer.createdAt,
        },
        apiToken, 
      },
    });
  } catch (err) {
    logger.error(`[Customer] Create error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create customer.',
    });
  }
}

async function listCustomers(req, res) {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { role: ROLES.CUSTOMER };

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select('-password -apiTokenHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    logger.error(`[Customer] List error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers.',
    });
  }
}


async function getCustomer(req, res) {
  try {
    const { customerId } = req.params;

    const customer = await User.findOne({
      _id: customerId,
      role: ROLES.CUSTOMER,
    }).select('-password -apiTokenHash');

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found.',
      });
    }

    const subCustomerCount = await User.countDocuments({
      parentCustomerId: customerId,
      role: ROLES.SUB_CUSTOMER,
    });

    const Device = require('../models/Device');
    const deviceCount = await Device.countDocuments({ customerId });

    res.json({
      success: true,
      data: {
        customer: {
          ...customer.toObject(),
          subCustomerCount,
          deviceCount,
        },
      },
    });
  } catch (err) {
    logger.error(`[Customer] Get error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer.',
    });
  }
}


async function updateCustomer(req, res) {
  try {
    const { customerId } = req.params;
    const { name, rateLimit, isActive, status } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (rateLimit !== undefined) updates.rateLimit = parseInt(rateLimit);
    if (isActive !== undefined) updates.isActive = isActive;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update.',
      });
    }

    const customer = await User.findOneAndUpdate(
      { _id: customerId, role: ROLES.CUSTOMER },
      updates,
      { new: true, runValidators: true }
    ).select('-password -apiTokenHash');

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found.',
      });
    }

    logger.info(`[Customer] Updated by ${req.user.email}: ${customer.email}`);

    res.json({
      success: true,
      message: 'Customer updated successfully.',
      data: { customer },
    });
  } catch (err) {
    logger.error(`[Customer] Update error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update customer.',
    });
  }
}

async function deleteCustomer(req, res) {
  try {
    const { customerId } = req.params;
    const { permanent = false } = req.query;

    if (permanent === 'true') {

      const customer = await User.findOneAndDelete({
        _id: customerId,
        role: ROLES.CUSTOMER,
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found.',
        });
      }


      await User.deleteMany({ parentCustomerId: customerId });


      const Device = require('../models/Device');
      await Device.deleteMany({ customerId });

      logger.warn(`[Customer] PERMANENTLY deleted by ${req.user.email}: ${customer.email}`);

      return res.json({
        success: true,
        message: 'Customer permanently deleted.',
      });
    } else {

      const customer = await User.findOneAndUpdate(
        { _id: customerId, role: ROLES.CUSTOMER },
        { status: 'deleted', isActive: false },
        { new: true }
      ).select('-password -apiTokenHash');

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found.',
        });
      }

      logger.info(`[Customer] Soft deleted by ${req.user.email}: ${customer.email}`);

      res.json({
        success: true,
        message: 'Customer deleted successfully.',
        data: { customer },
      });
    }
  } catch (err) {
    logger.error(`[Customer] Delete error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete customer.',
    });
  }
}

async function suspendCustomer(req, res) {
  try {
    const { customerId } = req.params;

    const customer = await User.findOneAndUpdate(
      { _id: customerId, role: ROLES.CUSTOMER },
      { status: 'suspended', isActive: false },
      { new: true }
    ).select('-password -apiTokenHash');

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found.',
      });
    }

    logger.info(`[Customer] Suspended by ${req.user.email}: ${customer.email}`);

    res.json({
      success: true,
      message: 'Customer suspended successfully.',
      data: { customer },
    });
  } catch (err) {
    logger.error(`[Customer] Suspend error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to suspend customer.',
    });
  }
}

async function activateCustomer(req, res) {
  try {
    const { customerId } = req.params;

    const customer = await User.findOneAndUpdate(
      { _id: customerId, role: ROLES.CUSTOMER },
      { status: 'active', isActive: true },
      { new: true }
    ).select('-password -apiTokenHash');

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found.',
      });
    }

    logger.info(`[Customer] Activated by ${req.user.email}: ${customer.email}`);

    res.json({
      success: true,
      message: 'Customer activated successfully.',
      data: { customer },
    });
  } catch (err) {
    logger.error(`[Customer] Activate error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to activate customer.',
    });
  }
}


async function resetCustomerPassword(req, res) {
  try {
    const { customerId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.',
      });
    }

    const customer = await User.findOne({
      _id: customerId,
      role: ROLES.CUSTOMER,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found.',
      });
    }

    customer.password = newPassword;
    await customer.save();

    logger.info(`[Customer] Password reset by ${req.user.email} for: ${customer.email}`);

    res.json({
      success: true,
      message: 'Password reset successfully.',
    });
  } catch (err) {
    logger.error(`[Customer] Reset password error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password.',
    });
  }
}

module.exports = {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  suspendCustomer,
  activateCustomer,
  resetCustomerPassword,
};
