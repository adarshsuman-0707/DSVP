const UserModel = require('../models/userModel');
const googleAuth = require('../services/googleAuthService');
const { sendWelcomeCredentialsEmail, sendGoogleLinkedNoticeEmail } = require('../services/emailService');
const { generateTempPassword, tempPasswordTtlMinutes } = require('../utils/passwordPolicy');
const { hashPassword } = require('../services/passwordService');
const audit = require('../services/securityAudit');
const { generateToken, userPayload, awardDailyLogin } = require('./authController');

const GENERIC_FAILURE = 'Google sign-in could not be verified. Please try again.';
// Never matches any bcrypt hash; only occupies the NOT NULL column when the
// proc ends up linking an existing account instead of inserting.
const UNUSABLE_HASH = '!';
const isDuplicateKey = (err) => err && (err.number === 2601 || err.number === 2627);

function statusError(res, status) {
  if (status === 'blocked') return res.status(403).json({ message: 'This account has been blocked. Contact support.', code: 'ACCOUNT_BLOCKED' });
  if (status === 'inactive') return res.status(403).json({ message: 'This account is inactive. Contact support to reactivate.', code: 'ACCOUNT_DEACTIVATED' });
  return null;
}

function loginUrl() {
  const base = (process.env.CLIENT_URL || '').split(',')[0].trim().replace(/\/$/, '');
  return base ? `${base}/login` : null;
}

/** Hash a fresh temp password and its expiry. The plaintext lives only in the returned object. */
async function newTempCredential() {
  const plain = generateTempPassword();
  const minutes = tempPasswordTtlMinutes();
  return {
    plain,
    minutes,
    hash: await hashPassword(plain),
    expiresAt: new Date(Date.now() + minutes * 60 * 1000),
  };
}

/**
 * Sends the credentials email. The caller must already hold the claim
 * (set at creation, or won via rotateTempPasswordForResend). Success marks
 * the account as emailed; failure releases the claim so the next Google
 * sign-in retries — with a freshly rotated password, never the old one.
 */
async function deliverWelcomeEmail(user, cred) {
  try {
    await sendWelcomeCredentialsEmail(user.Email, user.FullName, cred.plain, cred.minutes, loginUrl());
    await UserModel.markWelcomeEmailSent(user.UserId);
    return true;
  } catch (err) {
    console.error('Welcome email failed for user', user.UserId, '-', err.message);
    try { await UserModel.releaseWelcomeEmailClaim(user.UserId); } catch { /* retried on next sign-in */ }
    return false;
  }
}

/* GET /api/auth/google/nonce → { nonce } */
async function getNonce(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ nonce: await googleAuth.issueNonce() });
  } catch (err) {
    if (err.code === 'GOOGLE_NOT_CONFIGURED') {
      return res.status(503).json({ message: 'Google sign-in is not available right now.', code: 'GOOGLE_NOT_CONFIGURED' });
    }
    next(err);
  }
}

/* POST /api/auth/google  body: { credential } (Google ID token) */
async function googleLogin(req, res, next) {
  try {
    const { credential } = req.body || {};
    if (typeof credential !== 'string' || !credential || credential.length > 8192) {
      return res.status(400).json({ message: GENERIC_FAILURE, code: 'GOOGLE_INVALID' });
    }

    let claims;
    try {
      claims = await googleAuth.verifyCredential(credential);
    } catch (err) {
      if (err instanceof googleAuth.GoogleAuthError) {
        console.warn('Google sign-in rejected:', err.message);
        await audit.record(req, 'google_rejected', { meta: { reason: String(err.message).slice(0, 60) } });
        return res.status(401).json({ message: GENERIC_FAILURE, code: 'GOOGLE_INVALID' });
      }
      if (err.code === 'GOOGLE_NOT_CONFIGURED') {
        return res.status(503).json({ message: 'Google sign-in is not available right now.', code: 'GOOGLE_NOT_CONFIGURED' });
      }
      throw err;
    }

    let user = await UserModel.findByOAuthIdentity('google', claims.sub);
    let created = false;
    let linked = false;
    let cred = null; // plaintext only populated when a brand-new account was inserted

    if (user) {
      const blocked = statusError(res, user.Status);
      if (blocked) return blocked;
    } else {
      // Not yet linked: refuse inactive/blocked accounts *before* linking touches them.
      const existing = await UserModel.findByEmail(claims.email);
      if (existing) {
        const blocked = statusError(res, existing.Status);
        if (blocked) return blocked;
      }
      cred = existing ? null : await newTempCredential();

      const args = {
        sub: claims.sub,
        email: claims.email,
        fullName: (claims.name || claims.email.split('@')[0]).slice(0, 150),
        avatarUrl: claims.picture && claims.picture.length <= 500 ? claims.picture : null,
        passwordHash: cred ? cred.hash : UNUSABLE_HASH,
        tempPasswordExpiresAt: cred ? cred.expiresAt : new Date(),
      };
      try {
        user = await UserModel.upsertGoogleUser(args);
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        user = await UserModel.upsertGoogleUser(args); // concurrent first sign-in: second pass links to the winner
      }
      created = !!user.Created;
      linked = !!user.Linked;
      if (!created) cred = null;

      const blocked = statusError(res, user.Status);
      if (blocked) return blocked;
    }

    // Credentials email: exactly once per account — on creation, or a retry
    // only while the original delivery never succeeded.
    let welcomeEmailSent = false;
    if (created) {
      welcomeEmailSent = await deliverWelcomeEmail(user, cred);
    } else if (user.MustChangePassword && !user.WelcomeEmailSentAt) {
      const retry = await newTempCredential();
      if (await UserModel.rotateTempPasswordForResend(user.UserId, retry.hash, retry.expiresAt)) {
        welcomeEmailSent = await deliverWelcomeEmail(user, retry);
      }
    }

    if (linked) {
      sendGoogleLinkedNoticeEmail(user.Email, user.FullName)
        .catch((err) => console.error('Link notice email failed for user', user.UserId, '-', err.message));
    }

    await UserModel.updateLastLogin(user.UserId);
    await UserModel.logEvent(user.UserId, created ? 'signup' : 'login', { provider: 'google', created, linked });
    await audit.record(req, created ? 'google_signup' : linked ? 'google_linked' : 'google_login', { userId: user.UserId });
    const coinBalance = await awardDailyLogin(user);

    // Google sessions are full sessions — never restricted by the temp password.
    res.status(created ? 201 : 200).json({
      user: userPayload(user, coinBalance),
      token: generateToken(user),
      google: { created, linked, welcomeEmailSent },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getNonce, googleLogin };
