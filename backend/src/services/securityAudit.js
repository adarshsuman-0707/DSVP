const crypto = require('crypto');
const SecurityAuditModel = require('../models/securityAuditModel');

/**
 * Credential-free security audit trail (login outcomes, password changes and
 * resets, OTP failures, Google sign-in rejections).
 *
 *  - Unknown accounts are identified only by a truncated SHA-256 of the email.
 *  - `meta` keys that look like secrets are dropped, so a careless call site
 *    can't leak a password/token/OTP into the log.
 *  - Best-effort: an audit failure must never break authentication.
 */
const SECRET_KEY = /pass|token|otp|secret|credential|code|hash|nonce/i;

const identifierFor = (email) =>
  email ? crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex').slice(0, 16) : null;

function scrub(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!SECRET_KEY.test(k) && (v === null || ['string', 'number', 'boolean'].includes(typeof v))) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function record(req, eventType, { userId = null, email = null, meta = null } = {}) {
  try {
    await SecurityAuditModel.log({
      userId,
      eventType,
      identifier: identifierFor(email),
      ip: req?.ip ? String(req.ip).slice(0, 64) : null,
      userAgent: req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 200) : null,
      meta: scrub(meta),
    });
  } catch (err) {
    console.error('Security audit write failed:', err.message);
  }
}

module.exports = { record, scrub, identifierFor };
