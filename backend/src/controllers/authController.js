const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const CoinModel = require('../models/coinModel');
const OtpModel = require('../models/otpModel');
const { sendOtpEmail, sendSignupOtpEmail } = require('../services/emailService');
const { hashPassword, verifyPassword, verifyAgainstDecoy } = require('../services/passwordService');
const audit = require('../services/securityAudit');
const { validatePassword, checkPasswordPolicy, historyCount } = require('../utils/passwordPolicy');

const MAX_LOGIN_PASSWORD_LEN = 1024; // login never applies the *new-password* rules, but input is still bounded

/* ── helpers ── */
// `restricted` marks a session minted from a temporary password: the
// middleware then confines it to the change-password endpoints until the
// DB flag clears (see authMiddleware).
function generateToken(user, { restricted = false } = {}) {
  return jwt.sign(
    {
      userId: user.UserId,
      ...(restricted ? { mustChangePassword: true } : {}),
      role: user.Role,
      tokenVersion: user.TokenVersion ?? 1,
      subscriptionPlan: user.SubscriptionPlan || 'free',
      premiumModulesAccess: user.PremiumModulesAccess ? JSON.parse(user.PremiumModulesAccess) : []
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function policyError(res, errors) {
  return res.status(400).json({ message: errors.join(' '), code: 'PASSWORD_POLICY', errors });
}

/** True if `pw` equals the current password or any of the last N remembered ones. */
async function isReused(pw, userId, currentHash) {
  const history = await UserModel.getPasswordHistory(userId, historyCount());
  const checks = await Promise.all([currentHash, ...history].map((h) => verifyPassword(pw, h)));
  return checks.some(Boolean);
}

const reuseMessage = () => {
  const n = historyCount();
  return n > 0
    ? `Choose a password you haven’t used recently (your last ${n} passwords can’t be reused).`
    : 'New password must be different from your current password.';
};

async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password || [fullName, email, password].some((v) => typeof v !== 'string')) {
      return res.status(400).json({ message: 'fullName, email and password are required' });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const problems = await checkPasswordPolicy(password, { email: normalizedEmail, fullName });
    if (problems.length) return policyError(res, problems);

    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.createUser({ fullName: fullName.trim(), email: normalizedEmail, passwordHash });
    await UserModel.logEvent(user.UserId, 'signup');
    await audit.record(req, 'register', { userId: user.UserId });
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

function userPayload(user, coinBalance, mustChangePassword = false) {
  return {
    UserId: user.UserId,
    FullName: user.FullName,
    Email: user.Email,
    Role: user.Role,
    IsPremium: user.IsPremium,
    SubscriptionPlan: user.SubscriptionPlan || 'free',
    SubscriptionExpiry: user.SubscriptionExpiry,
    PremiumModulesAccess: user.PremiumModulesAccess ? JSON.parse(user.PremiumModulesAccess) : [],
    CoinsUnlocked: !!user.CoinsUnlocked,
    CoinBalance: coinBalance ?? user.CoinBalance ?? 0,
    CreatedAt: user.CreatedAt,
    MustChangePassword: mustChangePassword,
  };
}

// Daily login bonus — earn() itself no-ops for users who haven't
// unlocked coins yet (never purchased a plan), so this is safe to fire
// unconditionally; the once-per-day guard just avoids repeat awards
// for multiple logins on the same day. Returns the fresh balance.
async function awardDailyLogin(user) {
  let coinBalance = user.CoinBalance || 0;
  if (!(await CoinModel.hasEarnedToday(user.UserId, 'login'))) {
    const { applied, balance } = await CoinModel.earn(user.UserId, 5, 'login', 'Daily login bonus');
    if (applied) coinBalance = balance;
  }
  return coinBalance;
}

/**
 * Verifies the stored hash only — the new-password complexity rules are
 * deliberately NOT applied here, so credentials created under older rules
 * keep working. Errors stay generic; rate limiting is in the route.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'email and password are required' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (password.length > MAX_LOGIN_PASSWORD_LEN) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = await UserModel.findByEmail(normalizedEmail);
    if (!user) {
      await verifyAgainstDecoy(password);
      await audit.record(req, 'login_failed', { email: normalizedEmail, meta: { reason: 'unknown_account' } });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await verifyPassword(password, user.PasswordHash);
    if (!isMatch) {
      await audit.record(req, 'login_failed', { userId: user.UserId, email: normalizedEmail, meta: { reason: 'bad_password' } });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.Status === 'blocked') {
      await audit.record(req, 'login_denied', { userId: user.UserId, meta: { reason: 'blocked' } });
      return res.status(403).json({ message: 'This account has been blocked. Contact support.' });
    }
    if (user.Status === 'inactive') {
      await audit.record(req, 'login_denied', { userId: user.UserId, meta: { reason: 'inactive' } });
      return res.status(403).json({ message: 'This account is inactive. Contact support to reactivate.' });
    }

    // Temporary password: valid → restricted session that can only change the
    // password; expired → rejected (password is right but no longer usable).
    if (user.MustChangePassword) {
      if (user.TempPasswordExpiresAt && new Date(user.TempPasswordExpiresAt) < new Date()) {
        await audit.record(req, 'temp_password_expired', { userId: user.UserId });
        return res.status(401).json({
          message: 'Your temporary password has expired. Use "Forgot password" to set a new one.',
          code: 'TEMP_PASSWORD_EXPIRED',
        });
      }
      await UserModel.logEvent(user.UserId, 'login_temp_password');
      await audit.record(req, 'login_temp_password', { userId: user.UserId });
      return res.json({
        user: userPayload(user, user.CoinBalance, true),
        token: generateToken(user, { restricted: true }),
        mustChangePassword: true,
      });
    }

    await UserModel.updateLastLogin(user.UserId);
    await UserModel.logEvent(user.UserId, 'login');
    await audit.record(req, 'login_success', { userId: user.UserId });
    const coinBalance = await awardDailyLogin(user);

    res.json({ user: userPayload(user, coinBalance), token: generateToken(user) });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { ...user, MustChangePassword: !!req.user.mustChangePassword } });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   CHANGE PASSWORD — mandatory after a temporary-password login,
   also used by Profile → Change Password for any signed-in session.
   POST /api/auth/change-password  (alias: PATCH /api/users/password)
   body: { currentPassword, newPassword, confirmPassword }
   ═══════════════════════════════════════════════════════════ */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if ([currentPassword, newPassword, confirmPassword].some((v) => typeof v !== 'string' || !v)) {
      return res.status(400).json({ message: 'Current password, new password and confirmation are required.', code: 'VALIDATION' });
    }

    const record = await UserModel.getPasswordRecord(req.user.userId);
    if (!record) return res.status(404).json({ message: 'User not found' });
    if (record.Status !== 'active') {
      return res.status(403).json({ message: 'This account cannot change its password.', code: 'ACCOUNT_NOT_ACTIVE' });
    }
    if (record.MustChangePassword && record.TempPasswordExpiresAt && new Date(record.TempPasswordExpiresAt) < new Date()) {
      return res.status(401).json({
        message: 'Your temporary password has expired. Use "Forgot password" to set a new one.',
        code: 'TEMP_PASSWORD_EXPIRED',
      });
    }

    const fail = async (status, body, reason) => {
      await audit.record(req, 'password_change_failed', { userId: record.UserId, meta: { reason } });
      return res.status(status).json(body);
    };

    if (newPassword !== confirmPassword) {
      return fail(400, { message: 'New password and confirmation do not match.', code: 'PASSWORD_MISMATCH' }, 'mismatch');
    }
    const problems = await checkPasswordPolicy(newPassword, { email: record.Email, fullName: record.FullName });
    if (problems.length) return fail(400, { message: problems.join(' '), code: 'PASSWORD_POLICY', errors: problems }, 'policy');

    if (!(await verifyPassword(currentPassword, record.PasswordHash))) {
      return fail(400, { message: 'Current password is incorrect.', code: 'CURRENT_PASSWORD_INCORRECT' }, 'bad_current');
    }
    if (newPassword === currentPassword || (await verifyPassword(newPassword, record.PasswordHash))) {
      return fail(400, { message: 'New password must be different from your current password.', code: 'PASSWORD_UNCHANGED' }, 'same_as_current');
    }
    if (await isReused(newPassword, record.UserId, record.PasswordHash)) {
      return fail(400, { message: reuseMessage(), code: 'PASSWORD_REUSED' }, 'reused');
    }

    const newHash = await hashPassword(newPassword);
    const updated = await UserModel.completePasswordChange(record.UserId, record.PasswordHash, newHash, historyCount());
    if (!updated) {
      // Hash changed (or account deactivated) between read and write: the old credential is spent.
      return fail(409, { message: 'Your password was already changed. Please sign in again.', code: 'PASSWORD_ALREADY_CHANGED' }, 'conflict');
    }

    await UserModel.updateLastLogin(updated.UserId);
    await UserModel.logEvent(updated.UserId, 'password_change');
    await audit.record(req, 'password_changed', { userId: updated.UserId, meta: { wasTemporary: !!record.MustChangePassword } });
    const coinBalance = await awardDailyLogin(updated);

    // TokenVersion was bumped in the same transaction → every older JWT is dead
    // and this is the only valid session. (This app has no refresh tokens.)
    res.json({
      message: 'Password changed successfully.',
      user: userPayload(updated, coinBalance),
      token: generateToken(updated),
    });
  } catch (err) {
    next(err);
  }
}

const otpMinutes = () => parseInt(process.env.OTP_EXPIRES_MIN || '10', 10);
const sixDigitOtp = () => String(crypto.randomInt(100000, 1000000)); // CSPRNG, not Math.random

/* ═══════════════════════════════════════════════════════════
   FORGOT PASSWORD — STEP 1: Send OTP
   POST /api/auth/forgot-password/send-otp
   body: { email }
   ═══════════════════════════════════════════════════════════ */
async function sendOtp(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const generic = { message: 'If this email is registered, an OTP has been sent.' };

    const user = await UserModel.findByEmail(normalizedEmail);
    if (!user) {
      // Don't reveal whether email exists — send same response
      await audit.record(req, 'password_reset_requested', { email: normalizedEmail, meta: { known: false } });
      return res.json(generic);
    }

    await OtpModel.invalidate(normalizedEmail);

    const otp = sixDigitOtp();
    const expiresMin = otpMinutes();
    await OtpModel.create(normalizedEmail, otp, new Date(Date.now() + expiresMin * 60 * 1000));

    // Not awaited: SMTP can take seconds, and the response must look identical either way
    // (a delivery error must not reveal that the account exists).
    sendOtpEmail(normalizedEmail, otp, expiresMin)
      .catch(mailErr => console.error('Password-reset OTP email failed:', mailErr.message));
    await audit.record(req, 'password_reset_requested', { userId: user.UserId, meta: { known: true } });

    res.json(generic);
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   FORGOT PASSWORD — STEP 2: Verify OTP
   POST /api/auth/forgot-password/verify-otp
   body: { email, otp }
   ═══════════════════════════════════════════════════════════ */
async function verifyOtp(req, res, next) {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp || typeof email !== 'string' || typeof otp !== 'string') {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const record = await OtpModel.findLatest(normalizedEmail, otp.trim());

    const reject = async (message, reason) => {
      await audit.record(req, 'otp_verify_failed', { email: normalizedEmail, meta: { reason, flow: 'reset' } });
      return res.status(400).json({ message });
    };

    if (!record) return reject('Invalid OTP. Please check and try again.', 'invalid');
    if (record.Used) return reject('This OTP has already been used.', 'used');
    if (new Date(record.ExpiresAt) < new Date()) return reject('OTP has expired. Please request a new one.', 'expired');

    // OTP is valid — issue a short-lived reset token. The OTP row stays
    // unused until the reset step consumes it atomically (single use).
    const resetToken = jwt.sign(
      { email: normalizedEmail, otpId: record.OtpId, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ message: 'OTP verified successfully.', resetToken });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   FORGOT / ADMIN PASSWORD RESET — final step (also the way a
   Google-created account sets a DSVP password after the temp one expired)
   POST /api/auth/forgot-password/reset
   body: { resetToken, newPassword }
   ═══════════════════════════════════════════════════════════ */
async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = req.body || {};

    if (!resetToken || !newPassword || typeof resetToken !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'Reset token and new password are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Reset token is invalid or expired. Please start over.' });
    }
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token purpose.' });
    }

    const used = { message: 'This reset link has already been used or has expired.', code: 'RESET_TOKEN_USED' };
    const otp = await OtpModel.get(decoded.otpId);
    if (!otp || otp.Used || new Date(otp.ExpiresAt) < new Date() || String(otp.Email).toLowerCase() !== decoded.email) {
      await audit.record(req, 'password_reset_failed', { email: decoded.email, meta: { reason: 'token_used_or_expired' } });
      return res.status(400).json(used);
    }

    const user = await UserModel.findByEmail(decoded.email);
    if (!user) return res.status(400).json(used);
    if (user.Status !== 'active') {
      await audit.record(req, 'password_reset_failed', { userId: user.UserId, meta: { reason: user.Status } });
      return res.status(403).json({ message: 'This account cannot reset its password. Contact support.', code: 'ACCOUNT_NOT_ACTIVE' });
    }

    // Validate BEFORE consuming, so a rejected password doesn't burn the single-use token.
    const problems = await checkPasswordPolicy(newPassword, { email: user.Email, fullName: user.FullName });
    if (problems.length) return policyError(res, problems);
    if (await isReused(newPassword, user.UserId, user.PasswordHash)) {
      return res.status(400).json({ message: reuseMessage(), code: 'PASSWORD_REUSED' });
    }

    const consumed = await OtpModel.consume(decoded.otpId);   // atomic: only one request wins
    if (!consumed) return res.status(400).json(used);

    const newHash = await hashPassword(newPassword);
    // No old-hash guard: authorisation is the single-use token. Bumps TokenVersion → all sessions end.
    const updated = await UserModel.completePasswordChange(user.UserId, null, newHash, historyCount());
    if (!updated) {
      return res.status(403).json({ message: 'This account cannot reset its password. Contact support.', code: 'ACCOUNT_NOT_ACTIVE' });
    }

    await OtpModel.invalidate(user.Email);                    // retire any sibling tokens
    await audit.record(req, 'password_reset_completed', { userId: user.UserId });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   SIGNUP OTP — STEP 1: Send OTP
   POST /api/auth/signup/send-otp
   body: { email }
   ═══════════════════════════════════════════════════════════ */
async function sendSignupOtp(req, res, next) {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'This email is already registered. Please log in.' });
    }

    await OtpModel.invalidate(normalizedEmail, { onlySignup: true });

    // Stored with an 'S' prefix to distinguish signup OTPs from password-reset OTPs.
    const otpDigits = sixDigitOtp();
    const expiresMin = otpMinutes();
    await OtpModel.create(normalizedEmail, 'S' + otpDigits, new Date(Date.now() + expiresMin * 60 * 1000));

    // Not awaited so the response isn't held up by SMTP; the user can resend if it never arrives.
    sendSignupOtpEmail(normalizedEmail, otpDigits, expiresMin)
      .catch(mailErr => console.error('Signup OTP email failed:', mailErr.message));

    res.json({ message: 'OTP sent to your email.' });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   SIGNUP OTP — STEP 2: Verify OTP + Create Account
   POST /api/auth/signup/verify-otp
   body: { fullName, email, password, otp }
   ═══════════════════════════════════════════════════════════ */
async function verifySignupOtp(req, res, next) {
  try {
    const { fullName, email, password, otp } = req.body || {};

    if (!fullName || !email || !password || !otp || [fullName, email, password, otp].some((v) => typeof v !== 'string')) {
      return res.status(400).json({ message: 'fullName, email, password and otp are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Cheap offline rules first, so an obviously weak password fails without touching the OTP.
    const quick = validatePassword(password, { email: normalizedEmail, fullName });
    if (quick.length) return policyError(res, quick);

    const record = await OtpModel.findLatest(normalizedEmail, 'S' + otp.trim());
    const reject = async (message, reason) => {
      await audit.record(req, 'otp_verify_failed', { email: normalizedEmail, meta: { reason, flow: 'signup' } });
      return res.status(400).json({ message });
    };
    if (!record) return reject('Invalid OTP. Please check and try again.', 'invalid');
    if (record.Used) return reject('This OTP has already been used.', 'used');
    if (new Date(record.ExpiresAt) < new Date()) return reject('OTP has expired. Please request a new one.', 'expired');

    // Full policy (incl. breach check) only once the OTP itself is good.
    const problems = await checkPasswordPolicy(password, { email: normalizedEmail, fullName });
    if (problems.length) return policyError(res, problems);

    if (await UserModel.findByEmail(normalizedEmail)) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    if (!(await OtpModel.consume(record.OtpId))) {
      return res.status(400).json({ message: 'This OTP has already been used.' });
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.createUser({ fullName: fullName.trim(), email: normalizedEmail, passwordHash });
    await audit.record(req, 'register', { userId: user.UserId, meta: { verified: true } });
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, me, changePassword, sendOtp, verifyOtp, resetPassword, sendSignupOtp, verifySignupOtp,
  generateToken, userPayload, awardDailyLogin,
};
