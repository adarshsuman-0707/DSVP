const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');

/**
 * Verifies the JWT signature/expiry, then checks the DB on every request
 * for two things the token itself can't guarantee stay current:
 *   1. Status — a blocked/deactivated account must lose access immediately,
 *      not just fail on next login.
 *   2. TokenVersion — bumped by admin block/deactivate/reset-password, so a
 *      still-unexpired token issued before that action is rejected right
 *      away instead of remaining valid until it naturally expires.
 * Both come back as a `code` the frontend can act on precisely.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided', code: 'NO_TOKEN' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token', code: 'INVALID_TOKEN' });
  }

  try {
    const current = await UserModel.findAuthById(decoded.userId);
    if (!current) {
      return res.status(401).json({ message: 'Account no longer exists', code: 'INVALID_TOKEN' });
    }

    if (current.Status === 'blocked') {
      return res.status(401).json({
        message: 'Your account has been blocked by the administrator.',
        code: 'ACCOUNT_BLOCKED',
      });
    }
    if (current.Status === 'inactive') {
      return res.status(401).json({
        message: 'Your account has been deactivated by the administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const tokenVersion = decoded.tokenVersion ?? 1;
    if (tokenVersion !== current.TokenVersion) {
      return res.status(401).json({
        message: 'Your session has ended because your account changed. Please log in again.',
        code: 'SESSION_INVALIDATED',
      });
    }

    // Trust the DB, not the JWT, for anything that can change after login
    // (role, plan, per-module grants) — otherwise a user who gets upgraded
    // by an admin or via payment stays locked out of their new modules
    // until their token happens to expire and they log in again.
    req.user = {
      ...decoded,
      role: current.Role,
      subscriptionPlan: current.SubscriptionPlan || 'free',
      premiumModulesAccess: current.PremiumModulesAccess ? JSON.parse(current.PremiumModulesAccess) : [],
    };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { verifyToken, requireAdmin };
