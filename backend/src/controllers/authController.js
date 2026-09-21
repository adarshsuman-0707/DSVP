const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const CoinModel = require('../models/coinModel');
const { sql, getPool } = require('../config/db');
const { sendOtpEmail, sendSignupOtpEmail } = require('../services/emailService');

/* ── helpers ── */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.UserId,
      role: user.Role,
      tokenVersion: user.TokenVersion ?? 1,
      subscriptionPlan: user.SubscriptionPlan || 'free',
      premiumModulesAccess: user.PremiumModulesAccess ? JSON.parse(user.PremiumModulesAccess) : []
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'fullName, email and password are required' });
    }

    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.createUser({ fullName, email, passwordHash });
    await UserModel.logEvent(user.UserId, 'signup');
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.Status === 'blocked') {
      return res.status(403).json({ message: 'This account has been blocked. Contact support.' });
    }
    if (user.Status === 'inactive') {
      return res.status(403).json({ message: 'This account is inactive. Contact support to reactivate.' });
    }

    await UserModel.updateLastLogin(user.UserId);
    await UserModel.logEvent(user.UserId, 'login');

    // Daily login bonus — earn() itself no-ops for users who haven't
    // unlocked coins yet (never purchased a plan), so this is safe to fire
    // unconditionally; the once-per-day guard just avoids repeat awards
    // for multiple logins on the same day. Track the result so the
    // response reflects the fresh balance instead of the pre-earn snapshot.
    let coinBalance = user.CoinBalance || 0;
    if (!(await CoinModel.hasEarnedToday(user.UserId, 'login'))) {
      const { applied, balance } = await CoinModel.earn(user.UserId, 5, 'login', 'Daily login bonus');
      if (applied) coinBalance = balance;
    }

    const token = generateToken(user);

    res.json({
      user: {
        UserId: user.UserId,
        FullName: user.FullName,
        Email: user.Email,
        Role: user.Role,
        IsPremium: user.IsPremium,
        SubscriptionPlan: user.SubscriptionPlan || 'free',
        SubscriptionExpiry: user.SubscriptionExpiry,
        PremiumModulesAccess: user.PremiumModulesAccess ? JSON.parse(user.PremiumModulesAccess) : [],
        CoinsUnlocked: !!user.CoinsUnlocked,
        CoinBalance: coinBalance,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await UserModel.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   FORGOT PASSWORD — STEP 1: Send OTP
   POST /api/auth/forgot-password/send-otp
   body: { email }
   ═══════════════════════════════════════════════════════════ */
async function sendOtp(req, res, next) {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user exists
    const user = await UserModel.findByEmail(normalizedEmail);
    if (!user) {
      // Don't reveal whether email exists — send same response
      return res.json({ message: 'If this email is registered, an OTP has been sent.' });
    }

    const pool = await getPool();

    // Invalidate any previous unused OTPs for this email
    await pool.request()
      .input('Email', sql.NVarChar(255), normalizedEmail)
      .query(`UPDATE dbo.PasswordResetOtp SET Used = 1 WHERE Email = @Email AND Used = 0`);

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresMin = parseInt(process.env.OTP_EXPIRES_MIN || '10');
    const expiresAt  = new Date(Date.now() + expiresMin * 60 * 1000);

    // Store OTP in DB
    await pool.request()
      .input('Email',     sql.NVarChar(255), normalizedEmail)
      .input('OtpCode',   sql.VarChar(6),    otp)
      .input('ExpiresAt', sql.DateTime2,     expiresAt)
      .query(`
        INSERT INTO dbo.PasswordResetOtp (Email, OtpCode, ExpiresAt)
        VALUES (@Email, @OtpCode, @ExpiresAt)
      `);

    // Send email
    await sendOtpEmail(normalizedEmail, otp, expiresMin);

    res.json({ message: 'If this email is registered, an OTP has been sent.' });
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
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const pool = await getPool();

    const result = await pool.request()
      .input('Email',   sql.NVarChar(255), normalizedEmail)
      .input('OtpCode', sql.VarChar(6),    otp.trim())
      .query(`
        SELECT TOP 1 OtpId, ExpiresAt, Used
        FROM dbo.PasswordResetOtp
        WHERE Email = @Email AND OtpCode = @OtpCode
        ORDER BY CreatedAt DESC
      `);

    if (!result.recordset.length) {
      return res.status(400).json({ message: 'Invalid OTP. Please check and try again.' });
    }

    const record = result.recordset[0];

    if (record.Used) {
      return res.status(400).json({ message: 'This OTP has already been used.' });
    }

    if (new Date(record.ExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // OTP is valid — issue a short-lived reset token (don't mark used yet, reset step will do that)
    const resetToken = jwt.sign(
      { email: normalizedEmail, otpId: record.OtpId, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      message: 'OTP verified successfully.',
      resetToken,
    });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════
   FORGOT PASSWORD — STEP 3: Reset Password
   POST /api/auth/forgot-password/reset
   body: { resetToken, newPassword }
   ═══════════════════════════════════════════════════════════ */
async function resetPassword(req, res, next) {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: 'Reset token and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Reset token is invalid or expired. Please start over.' });
    }

    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ message: 'Invalid token purpose.' });
    }

    const pool = await getPool();

    // Verify OTP record is still unused
    const otpCheck = await pool.request()
      .input('OtpId', sql.Int, decoded.otpId)
      .query(`SELECT Used FROM dbo.PasswordResetOtp WHERE OtpId = @OtpId`);

    if (!otpCheck.recordset.length || otpCheck.recordset[0].Used) {
      return res.status(400).json({ message: 'This reset link has already been used.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool.request()
      .input('Email',        sql.NVarChar(255), decoded.email)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .query(`
        UPDATE dbo.Users
        SET PasswordHash = @PasswordHash, UpdatedAt = SYSUTCDATETIME()
        WHERE Email = @Email
      `);

    // Mark OTP as used
    await pool.request()
      .input('OtpId', sql.Int, decoded.otpId)
      .query(`UPDATE dbo.PasswordResetOtp SET Used = 1 WHERE OtpId = @OtpId`);

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
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check email not already registered
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'This email is already registered. Please log in.' });
    }

    const pool = await getPool();

    // Invalidate any previous unused signup OTPs for this email
    await pool.request()
      .input('Email', sql.NVarChar(255), normalizedEmail)
      .query(`UPDATE dbo.PasswordResetOtp SET Used = 1
              WHERE Email = @Email AND Used = 0 AND OtpCode LIKE 'S%'`);

    // Generate 6-digit OTP  (prefix 'S' in storage to distinguish from password-reset OTPs)
    const otpDigits  = Math.floor(100000 + Math.random() * 900000).toString();
    const storedCode = 'S' + otpDigits;           // stored with prefix
    const expiresMin = parseInt(process.env.OTP_EXPIRES_MIN || '10');
    const expiresAt  = new Date(Date.now() + expiresMin * 60 * 1000);

    await pool.request()
      .input('Email',     sql.NVarChar(255), normalizedEmail)
      .input('OtpCode',   sql.VarChar(10),    storedCode)
      .input('ExpiresAt', sql.DateTime2,     expiresAt)
      .query(`INSERT INTO dbo.PasswordResetOtp (Email, OtpCode, ExpiresAt)
              VALUES (@Email, @OtpCode, @ExpiresAt)`);

    await sendSignupOtpEmail(normalizedEmail, otpDigits, expiresMin);

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
    const { fullName, email, password, otp } = req.body;

    if (!fullName || !email || !password || !otp) {
      return res.status(400).json({ message: 'fullName, email, password and otp are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const storedCode      = 'S' + otp.trim();   // re-attach prefix

    const pool = await getPool();

    // Verify OTP
    const result = await pool.request()
      .input('Email',   sql.NVarChar(255), normalizedEmail)
      .input('OtpCode', sql.VarChar(10),    storedCode)
      .query(`SELECT TOP 1 OtpId, ExpiresAt, Used
              FROM dbo.PasswordResetOtp
              WHERE Email = @Email AND OtpCode = @OtpCode
              ORDER BY CreatedAt DESC`);

    if (!result.recordset.length) {
      return res.status(400).json({ message: 'Invalid OTP. Please check and try again.' });
    }

    const record = result.recordset[0];
    if (record.Used) {
      return res.status(400).json({ message: 'This OTP has already been used.' });
    }
    if (new Date(record.ExpiresAt) < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Double-check email not registered between otp send and verify
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user         = await UserModel.createUser({ fullName: fullName.trim(), email: normalizedEmail, passwordHash });
    const token        = generateToken(user);

    // Mark OTP used
    await pool.request()
      .input('OtpId', sql.Int, record.OtpId)
      .query(`UPDATE dbo.PasswordResetOtp SET Used = 1 WHERE OtpId = @OtpId`);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me, sendOtp, verifyOtp, resetPassword, sendSignupOtp, verifySignupOtp, generateToken };
