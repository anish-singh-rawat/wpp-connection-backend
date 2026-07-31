'use strict';

const { ROLES } = require('../models/User');

function buildTenantFilter(req, baseFilter = {}) {
  const { role, userId, parentCustomerId } = req.user || {};

  if (!role) {
    throw new Error('User role not found in request. Authentication required.');
  }

  const filter = { ...baseFilter };

  if (role === ROLES.SUPER_ADMIN) {
    return filter;
  }

  if (role === ROLES.CUSTOMER) {
    filter.customerId = userId;
    return filter;
  }

  if (role === ROLES.SUB_CUSTOMER) {
    filter.customerId = parentCustomerId; 
    filter.subCustomerId = userId; 
    return filter;
  }

  throw new Error('Invalid user role.');
}

function buildOwnershipData(req) {
  const { role, userId, parentCustomerId } = req.user || {};

  if (!role || !userId) {
    throw new Error('User authentication data not found in request.');
  }

  if (role === ROLES.SUPER_ADMIN) {
    throw new Error('SUPER_ADMIN must specify customerId explicitly when creating resources.');
  }

  if (role === ROLES.CUSTOMER) {
    return {
      customerId: userId,
      subCustomerId: null,
      createdBy: userId,
    };
  }

  if (role === ROLES.SUB_CUSTOMER) {
    return {
      customerId: parentCustomerId,
      subCustomerId: userId,
      createdBy: userId,
    };
  }

  throw new Error('Invalid user role.');
}

function validateTenantAccess(req, resource) {
  const { role, userId, parentCustomerId } = req.user || {};

  if (!resource) {
    throw new Error('Resource not found.');
  }

  if (role === ROLES.SUPER_ADMIN) {
    return true;
  }

  if (role === ROLES.CUSTOMER) {
    if (resource.customerId && resource.customerId.toString() === userId.toString()) {
      return true;
    }
    throw new Error('Forbidden. Resource does not belong to your account.');
  }

  if (role === ROLES.SUB_CUSTOMER) {
    const resourceCustomerId = resource.customerId?.toString();
    const resourceSubCustomerId = resource.subCustomerId?.toString();

    if (
      resourceCustomerId === parentCustomerId?.toString() &&
      resourceSubCustomerId === userId.toString()
    ) {
      return true;
    }
    throw new Error('Forbidden. Resource does not belong to you.');
  }

  throw new Error('Invalid user role.');
}

function canAccessUser(req, targetUser) {
  const { role, userId } = req.user || {};

  if (role === ROLES.SUPER_ADMIN) {
    return true;
  }

  if (userId.toString() === targetUser._id.toString()) {
    return true;
  }

  if (role === ROLES.CUSTOMER && targetUser.role === ROLES.SUB_CUSTOMER) {
    return (
      targetUser.parentCustomerId &&
      targetUser.parentCustomerId.toString() === userId.toString()
    );
  }

  return false;
}

function getEffectiveCustomerId(req) {
  const { role, userId, parentCustomerId } = req.user || {};

  if (role === ROLES.CUSTOMER) {
    return userId.toString();
  }

  if (role === ROLES.SUB_CUSTOMER) {
    return parentCustomerId.toString();
  }

  return null;
}

function isCustomer(req) {
  return req.user?.role === ROLES.CUSTOMER;
}

function isSubCustomer(req) {
  return req.user?.role === ROLES.SUB_CUSTOMER;
}


function isSuperAdmin(req) {
  return req.user?.role === ROLES.SUPER_ADMIN;
}

function canManageSubCustomers(req) {
  return req.user?.role === ROLES.CUSTOMER || req.user?.role === ROLES.SUPER_ADMIN;
}

function attachTenantFilter(req, res, next) {
  try {
    req.tenantFilter = buildTenantFilter(req);
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: err.message || 'Failed to build tenant filter.',
    });
  }
}

function attachOwnershipData(req, res, next) {
  try {
    req.ownershipData = buildOwnershipData(req);
    next();
  } catch (err) {
    if (req.user?.role === ROLES.SUPER_ADMIN) {
      req.ownershipData = null; 
      return next();
    }
    
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to build ownership data.',
    });
  }
}

module.exports = {
  buildTenantFilter,
  buildOwnershipData,
  validateTenantAccess,
  canAccessUser,
  getEffectiveCustomerId,
  isCustomer,
  isSubCustomer,
  isSuperAdmin,
  canManageSubCustomers,
  attachTenantFilter,
  attachOwnershipData,
  ROLES,
};
