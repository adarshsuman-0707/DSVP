const { sql, getPool } = require('../config/db');

/**
 * Signup OTPs, forgot-password OTPs and admin reset links all live in
 * dbo.PasswordResetOtp. Parameterized stored procedures only.
 */
const OtpModel = {
  async invalidate(email, { onlySignup = false } = {}) {
    const pool = await getPool();
    await pool.request()
      .input('Email', sql.NVarChar(255), email)
      .input('OnlySignup', sql.Bit, onlySignup ? 1 : 0)
      .execute('sp_OtpInvalidate');
  },

  async create(email, code, expiresAt) {
    const pool = await getPool();
    const r = await pool.request()
      .input('Email', sql.NVarChar(255), email)
      .input('OtpCode', sql.VarChar(64), code)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .execute('sp_OtpCreate');
    return r.recordset[0].OtpId;
  },

  async findLatest(email, code) {
    const pool = await getPool();
    const r = await pool.request()
      .input('Email', sql.NVarChar(255), email)
      .input('OtpCode', sql.VarChar(64), code)
      .execute('sp_OtpFindLatest');
    return r.recordset[0];
  },

  async get(otpId) {
    const pool = await getPool();
    const r = await pool.request().input('OtpId', sql.Int, otpId).execute('sp_OtpGet');
    return r.recordset[0];
  },

  // Atomic single-use: returns { OtpId, Email } for the first caller only.
  async consume(otpId) {
    const pool = await getPool();
    const r = await pool.request().input('OtpId', sql.Int, otpId).execute('sp_OtpConsume');
    return r.recordset[0];
  },
};

module.exports = OtpModel;
