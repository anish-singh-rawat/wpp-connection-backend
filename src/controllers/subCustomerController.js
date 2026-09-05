'use strict';

const User = require('../models/User');
const { ROLES } = require('../models/User');
const logger = require('../utils/logger');


async function createSubCustomer(req, res) {
  try {
    const { name, email, password } = req.body;
    const parentCustomerId = req.user.userId; 


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


    const subCustomer = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: ROLES.SUB_CUSTOMER,
      parentCustomerId, 
      createdBy: parentCustomerId,
      isActive: true,
      status: 'active',
    });

    logger.info(`[SubCustomer] Created by ${req.user.email}: ${subCustomer.email}`);

    res.status(201).json({
      success: true,
      message: 'Sub-customer created successfully.',
      data: {
        subCustomer: {
          id: subCustomer._id,
          name: subCustomer.name,
          email: subCustomer.email,
          role: subCustomer.role,
          parentCustomerId: subCustomer.parentCustomerId,
          isActive: subCustomer.isActive,
          status: subCustomer.status,
          createdAt: subCustomer.createdAt,
        },
      },
    });
  } catch (err) {
    logger.error(`[SubCustomer] Create error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create sub-customer.',
    });
  }
}


async function listSubCustomers(req, res) {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = { role: ROLES.SUB_CUSTOMER };


    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }


    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [subCustomers, total] = await Promise.all([
      User.find(filter)
        .select('-password -apiTokenHash')
        .populate('parentCustomerId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        subCustomers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    logger.error(`[SubCustomer] List error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sub-customers.',
    });
  }
}

async function getSubCustomer(req, res) {
  try {
    const { subCustomerId } = req.params;

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };


    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    const subCustomer = await User.findOne(filter)
      .select('-password -apiTokenHash')
      .populate('parentCustomerId', 'name email')
      .lean();

    if (!subCustomer) {
      return res.status(404).json({
        success: false,
        error: 'Sub-customer not found.',
      });
    }


    const Device = require('../models/Device');
    const deviceCount = await Device.countDocuments({
      subCustomerId: subCustomerId,
    });

    res.json({
      success: true,
      data: {
        subCustomer: {
          ...subCustomer,
          deviceCount,
        },
      },
    });
  } catch (err) {
    logger.error(`[SubCustomer] Get error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sub-customer.',
    });
  }
}


async function updateSubCustomer(req, res) {
  try {
    const { subCustomerId } = req.params;
    const { name, isActive, status } = req.body;

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };


    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update.',
      });
    }

    const subCustomer = await User.findOneAndUpdate(
      filter,
      updates,
      { new: true, runValidators: true }
    ).select('-password -apiTokenHash');

    if (!subCustomer) {
      return res.status(404).json({
        success: false,
        error: 'Sub-customer not found.',
      });
    }

    logger.info(`[SubCustomer] Updated by ${req.user.email}: ${subCustomer.email}`);

    res.json({
      success: true,
      message: 'Sub-customer updated successfully.',
      data: { subCustomer },
    });
  } catch (err) {
    logger.error(`[SubCustomer] Update error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update sub-customer.',
    });
  }
}


async function deleteSubCustomer(req, res) {
  try {
    const { subCustomerId } = req.params;
    const { permanent = false } = req.query;

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };


    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    if (permanent === 'true') {
  
      const subCustomer = await User.findOneAndDelete(filter);

      if (!subCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Sub-customer not found.',
        });
      }

  
      const Device = require('../models/Device');
      await Device.deleteMany({ subCustomerId });

      logger.warn(`[SubCustomer] PERMANENTLY deleted by ${req.user.email}: ${subCustomer.email}`);

      return res.json({
        success: true,
        message: 'Sub-customer permanently deleted.',
      });
    } else {
  
      const subCustomer = await User.findOneAndUpdate(
        filter,
        { status: 'deleted', isActive: false },
        { new: true }
      ).select('-password -apiTokenHash');

      if (!subCustomer) {
        return res.status(404).json({
          success: false,
          error: 'Sub-customer not found.',
        });
      }

      logger.info(`[SubCustomer] Soft deleted by ${req.user.email}: ${subCustomer.email}`);

      res.json({
        success: true,
        message: 'Sub-customer deleted successfully.',
        data: { subCustomer },
      });
    }
  } catch (err) {
    logger.error(`[SubCustomer] Delete error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete sub-customer.',
    });
  }
}


async function suspendSubCustomer(req, res) {
  try {
    const { subCustomerId } = req.params;

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };

    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    const subCustomer = await User.findOneAndUpdate(
      filter,
      { status: 'suspended', isActive: false },
      { new: true }
    ).select('-password -apiTokenHash');

    if (!subCustomer) {
      return res.status(404).json({
        success: false,
        error: 'Sub-customer not found.',
      });
    }

    logger.info(`[SubCustomer] Suspended by ${req.user.email}: ${subCustomer.email}`);

    res.json({
      success: true,
      message: 'Sub-customer suspended successfully.',
      data: { subCustomer },
    });
  } catch (err) {
    logger.error(`[SubCustomer] Suspend error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to suspend sub-customer.',
    });
  }
}


async function activateSubCustomer(req, res) {
  try {
    const { subCustomerId } = req.params;

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };

    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    const subCustomer = await User.findOneAndUpdate(
      filter,
      { status: 'active', isActive: true },
      { new: true }
    ).select('-password -apiTokenHash');

    if (!subCustomer) {
      return res.status(404).json({
        success: false,
        error: 'Sub-customer not found.',
      });
    }

    logger.info(`[SubCustomer] Activated by ${req.user.email}: ${subCustomer.email}`);

    res.json({
      success: true,
      message: 'Sub-customer activated successfully.',
      data: { subCustomer },
    });
  } catch (err) {
    logger.error(`[SubCustomer] Activate error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to activate sub-customer.',
    });
  }
}


async function resetSubCustomerPassword(req, res) {
  try {
    const { subCustomerId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long.',
      });
    }

    const filter = {
      _id: subCustomerId,
      role: ROLES.SUB_CUSTOMER,
    };

    if (req.user.role === ROLES.CUSTOMER) {
      filter.parentCustomerId = req.user.userId;
    }

    const subCustomer = await User.findOne(filter);

    if (!subCustomer) {
      return res.status(404).json({
        success: false,
        error: 'Sub-customer not found.',
      });
    }

    subCustomer.password = newPassword;
    await subCustomer.save();

    logger.info(`[SubCustomer] Password reset by ${req.user.email} for: ${subCustomer.email}`);

    res.json({
      success: true,
      message: 'Password reset successfully.',
    });
  } catch (err) {
    logger.error(`[SubCustomer] Reset password error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password.',
    });
  }
}

module.exports = {
  createSubCustomer,
  listSubCustomers,
  getSubCustomer,
  updateSubCustomer,
  deleteSubCustomer,
  suspendSubCustomer,
  activateSubCustomer,
  resetSubCustomerPassword,
};
