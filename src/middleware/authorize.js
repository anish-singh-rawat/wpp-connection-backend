'use strict';

const { ROLES } = require('../models/User');

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden. Insufficient permissions.',
      });
    }

    next();
  };
}

const onlySuperAdmin = authorize(ROLES.SUPER_ADMIN);
const onlyCustomer = authorize(ROLES.CUSTOMER);
const onlySubCustomer = authorize(ROLES.SUB_CUSTOMER);
const superAdminOrCustomer = authorize(ROLES.SUPER_ADMIN, ROLES.CUSTOMER);
const customerOrSubCustomer = authorize(ROLES.CUSTOMER, ROLES.SUB_CUSTOMER);
const allRoles = authorize(ROLES.SUPER_ADMIN, ROLES.CUSTOMER, ROLES.SUB_CUSTOMER);


function requireOwnership(getResourceOwnerId) {
  return async (req, res, next) => {
    try {

      if (req.user && req.user.role === ROLES.SUPER_ADMIN) {
        return next();
      }

      const ownerId = await getResourceOwnerId(req);
      
      if (!ownerId) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found.',
        });
      }

      const requestingUserId = req.user ? req.user.userId.toString() : null;


      if (requestingUserId && ownerId.toString() === requestingUserId) {
        return next();
      }


      if (req.user && req.user.role === ROLES.CUSTOMER) {
  
  
        return next(); 
      }

      return res.status(403).json({
        success: false,
        error: 'Forbidden. You do not have access to this resource.',
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Authorization check failed.',
      });
    }
  };
}

function requireHierarchyAccess() {
  return async (req, res, next) => {
    try {
      const { role, userId } = req.user;
      

      if (role === ROLES.SUPER_ADMIN) {
        return next();
      }

      const targetId = req.params.userId || req.params.customerId || req.params.subCustomerId;
      
      if (!targetId) {
        return next();
      }


      if (userId.toString() === targetId.toString()) {
        return next();
      }

      if (role === ROLES.CUSTOMER) {
  
        const User = require('../models/User');
        const target = await User.findOne({
          _id: targetId,
          parentCustomerId: userId,
          role: ROLES.SUB_CUSTOMER,
        }).lean();

        if (!target) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden. Resource does not belong to your hierarchy.',
          });
        }

        req.targetUser = target;
        return next();
      }


      if (role === ROLES.SUB_CUSTOMER) {
        if (userId.toString() !== targetId.toString()) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden. You can only access your own data.',
          });
        }
      }

      next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: 'Authorization check failed.',
      });
    }
  };
}

module.exports = {
  authorize,
  onlySuperAdmin,
  onlyCustomer,
  onlySubCustomer,
  superAdminOrCustomer,
  customerOrSubCustomer,
  allRoles,
  requireOwnership,
  requireHierarchyAccess,
  ROLES,
};
