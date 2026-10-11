const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const UserModel = require('../models/userModel');

/**
 * Google Sign-In (OpenID Connect ID-token flow via Google Identity Services).
 *
 * CSRF / replay protection: the SPA asks us for a single-use nonce, passes it
 * to Google, and Google embeds it in the signed ID token. We accept the token
 * only if its nonce is one we issued, unexpired, and not yet consumed
 * (atomic DELETE) — so a stolen or replayed credential is useless. Only the
 * SHA-256 of the nonce is stored. No client secret is needed for this flow;
 * the ID token's signature is verified against Google's published keys.
 */
const VALID_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let _client = null;
const getClient = () => (_client ||= new OAuth2Client());

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function nonceTtlMs() {
  const n = parseInt(process.env.GOOGLE_NONCE_TTL_MIN, 10);
  return (Number.isFinite(n) && n > 0 ? n : 5) * 60 * 1000;
}

function clientId() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw Object.assign(new Error('GOOGLE_CLIENT_ID is not configured'), { code: 'GOOGLE_NOT_CONFIGURED' });
  return id;
}

async function issueNonce() {
  clientId(); // fail early when Google sign-in isn't configured
  const nonce = crypto.randomBytes(32).toString('base64url');
  await UserModel.createOAuthNonce(sha256(nonce), new Date(Date.now() + nonceTtlMs()));
  return nonce;
}

class GoogleAuthError extends Error {}

/**
 * Verifies the ID token and consumes its nonce. Returns trusted claims:
 * { sub, email, name, picture }. Throws GoogleAuthError on any failure.
 */
async function verifyCredential(credential) {
  const audience = clientId();
  let payload;
  try {
    const ticket = await getClient().verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch (err) {
    // err.message from the library never contains the token (e.g. 'Wrong recipient', 'Token used too late')
    throw new GoogleAuthError('invalid token: ' + String(err.message).slice(0, 160)); // signature / expiry / audience
  }
  if (!payload || !VALID_ISSUERS.includes(payload.iss)) throw new GoogleAuthError('bad issuer');
  if (payload.aud !== audience) throw new GoogleAuthError('bad audience');
  if (!payload.sub || !payload.email) throw new GoogleAuthError('missing claims');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new GoogleAuthError('email not verified');
  if (typeof payload.nonce !== 'string' || !payload.nonce) throw new GoogleAuthError('missing nonce');

  const consumed = await UserModel.consumeOAuthNonce(sha256(payload.nonce));
  if (!consumed) throw new GoogleAuthError('nonce invalid, expired or already used');

  return {
    sub: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: (payload.name || '').toString().trim(),
    picture: payload.picture ? String(payload.picture) : null,
  };
}

module.exports = { issueNonce, verifyCredential, GoogleAuthError };
