const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');

/**
 * Verifies the JWT signature/expiry, then checks the DB on every request
 * for what the token itself can't guarantee stay current:
 *   1. Status — a blocked/deactivated account must lose access immediately,
 *      not just fail on next login.
 *   2. TokenVersion — bumped by admin block/deactivate/reset-password and by
 *      every password change, so a still-unexpired token issued before that
 *      is rejected right away instead of remaining valid until it expires.
 *   3. Password-change restriction — a session minted from a *temporary*
 *      password carries `mustChangePassword`. While the DB still says the
 *      password must be changed, such a session may only reach routes that
 *      opt in (verifyTokenAllowRestricted); everything else is 403.
 *      (Google sessions are never restricted — they don't use the temp password.)
 * All come back as a `code` the frontend can act on precisely.
 */
function makeVerifier({ allowRestricted }) {
  return async function verify(req, res, next) {
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

    // Purpose-scoped JWTs (e.g. password_reset) are signed with the same
    // secret but are not sessions.
    if (decoded.purpose || decoded.userId == null) {
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

      const restricted = decoded.mustChangePassword === true && !!current.MustChangePassword;
      if (restricted) {
        if (current.TempPasswordExpiresAt && new Date(current.TempPasswordExpiresAt) < new Date()) {
          return res.status(401).json({
            message: 'Your temporary password has expired. Use "Forgot password" to set a new one.',
            code: 'TEMP_PASSWORD_EXPIRED',
          });
        }
        if (!allowRestricted) {
          return res.status(403).json({
            message: 'You must change your temporary password before using DSVP.',
            code: 'PASSWORD_CHANGE_REQUIRED',
          });
        }
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
        mustChangePassword: restricted,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Default guard for every protected API: rejects password-change-restricted sessions. */
const verifyToken = makeVerifier({ allowRestricted: false });
/** Only for /auth/me and /auth/change-password: lets a restricted session through. */
const verifyTokenAllowRestricted = makeVerifier({ allowRestricted: true });

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { verifyToken, verifyTokenAllowRestricted, requireAdmin };
