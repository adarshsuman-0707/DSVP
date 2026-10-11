const { sql, getPool } = require('../config/db');

const UserModel = {
  async createUser({ fullName, email, passwordHash }) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('FullName', sql.NVarChar(150), fullName)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .execute('sp_CreateUser');
    return result.recordset[0];
  },

  async findByEmail(email) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('Email', sql.NVarChar(255), email)
      .execute('sp_FindUserByEmail');
    return result.recordset[0];
  },

  async findById(userId) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, userId)
      .execute('sp_FindUserById');
    return result.recordset[0];
  },

  // Lean lookup used on every authenticated request (authMiddleware) — both
  // to validate the token is still current, and to source plan/role fresh
  // from the DB rather than trusting the JWT's claims, which are frozen at
  // login time and go stale the moment an admin changes a user's plan.
  async findAuthById(userId) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, userId)
      .execute('sp_FindUserAuthById');
    return result.recordset[0];
  },

  // Bumping this invalidates every JWT already issued for the user, since
  // the middleware compares it against the version baked into the token.
  async incrementTokenVersion(userId) {
    const pool = await getPool();
    const req = pool.request();
    req.input('UserId', sql.Int, userId);
    req.output('NewTokenVersion', sql.Int);
    const result = await req.execute('sp_IncrementTokenVersion');
    return result.output.NewTokenVersion;
  },

  async updateLastLogin(userId) {
    const pool = await getPool();
    await pool
      .request()
      .input('UserId', sql.Int, userId)
      .execute('sp_UpdateLastLogin');
  },

  async logEvent(userId, eventType, meta = null) {
    const pool = await getPool();
    await pool
      .request()
      .input('UserId', sql.Int, userId)
      .input('EventType', sql.VarChar(50), eventType)
      .input('MetaJson', sql.NVarChar(sql.MAX), meta ? JSON.stringify(meta) : null)
      .execute('sp_LogAnalyticsEvent');
  },

  async listAll({ page = 1, pageSize = 20 } = {}) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('Page', sql.Int, page)
      .input('PageSize', sql.Int, pageSize)
      .execute('sp_ListAllUsersPaged');
    return result.recordset;
  },

  async listPaged({ page = 1, pageSize = 20, search = '', role = null, status = null, plan = null, joinedFrom = null, joinedTo = null } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('Page', sql.Int, page);
    req.input('PageSize', sql.Int, pageSize);
    req.input('Search', sql.NVarChar(255), search || null);
    req.input('Role', sql.VarChar(20), role || null);
    req.input('Status', sql.VarChar(20), status || null);
    req.input('Plan', sql.VarChar(20), plan || null);
    req.input('JoinedFrom', sql.DateTime2, joinedFrom || null);
    req.input('JoinedTo', sql.DateTime2, joinedTo || null);
    req.output('TotalRecords', sql.Int);
    const result = await req.execute('sp_GetUsersPaged');
    return { rows: result.recordset, total: result.output.TotalRecords };
  },

  async getStatusSummary() {
    const pool = await getPool();
    const r = await pool.request().execute('sp_GetUserStatusSummary');
    return r.recordset[0];
  },

  async updateStatus(userId, status) {
    const pool = await getPool();
    await pool.request()
      .input('UserId', sql.Int, userId)
      .input('Status', sql.VarChar(20), status)
      .execute('sp_UpdateUserStatus');
  },

  async updatePasswordHash(userId, passwordHash) {
    const pool = await getPool();
    await pool.request()
      .input('UserId', sql.Int, userId)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .execute('sp_UpdateUserPasswordHash');
  },

  /* ── Google sign-in / temporary password ── */
  async createOAuthNonce(nonceHash, expiresAt) {
    const pool = await getPool();
    await pool.request()
      .input('NonceHash', sql.Char(64), nonceHash)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .execute('sp_OAuthNonceCreate');
  },

  // true only for the first caller presenting an unexpired nonce
  async consumeOAuthNonce(nonceHash) {
    const pool = await getPool();
    const r = await pool.request().input('NonceHash', sql.Char(64), nonceHash).execute('sp_OAuthNonceConsume');
    return r.recordset.length > 0;
  },

  async findByOAuthIdentity(provider, providerUserId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('Provider', sql.VarChar(20), provider)
      .input('ProviderUserId', sql.NVarChar(255), providerUserId)
      .execute('sp_FindUserByOAuthIdentity');
    return r.recordset[0];
  },

  // Atomic find / link / create. Row includes Created and Linked flags.
  async upsertGoogleUser({ sub, email, fullName, avatarUrl, passwordHash, tempPasswordExpiresAt }) {
    const pool = await getPool();
    const r = await pool.request()
      .input('ProviderUserId', sql.NVarChar(255), sub)
      .input('Email', sql.NVarChar(255), email)
      .input('FullName', sql.NVarChar(150), fullName)
      .input('AvatarUrl', sql.NVarChar(500), avatarUrl)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .input('TempPasswordExpiresAt', sql.DateTime2, tempPasswordExpiresAt)
      .execute('sp_UpsertGoogleUser');
    return r.recordset[0];
  },

  // Claims the right to (re)send credentials; true for exactly one caller.
  async rotateTempPasswordForResend(userId, passwordHash, tempPasswordExpiresAt) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .input('TempPasswordExpiresAt', sql.DateTime2, tempPasswordExpiresAt)
      .execute('sp_RotateTempPasswordForResend');
    return r.recordset.length > 0;
  },

  async markWelcomeEmailSent(userId) {
    const pool = await getPool();
    await pool.request().input('UserId', sql.Int, userId).execute('sp_MarkWelcomeEmailSent');
  },

  async releaseWelcomeEmailClaim(userId) {
    const pool = await getPool();
    await pool.request().input('UserId', sql.Int, userId).execute('sp_ReleaseWelcomeEmailClaim');
  },

  async getPasswordRecord(userId) {
    const pool = await getPool();
    const r = await pool.request().input('UserId', sql.Int, userId).execute('sp_GetPasswordRecord');
    return r.recordset[0];
  },

  // Password change / reset in one transaction: archives the old hash,
  // clears temp-password state, bumps TokenVersion (kills every older JWT).
  // oldPasswordHash is a compare-and-set guard (null for reset flows).
  // Returns the updated user, or undefined if the guard failed / the account
  // isn't active.
  async completePasswordChange(userId, oldPasswordHash, newPasswordHash, historyKeep = 5) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .input('OldPasswordHash', sql.NVarChar(255), oldPasswordHash)
      .input('NewPasswordHash', sql.NVarChar(255), newPasswordHash)
      .input('HistoryKeep', sql.Int, historyKeep)
      .execute('sp_CompletePasswordChange');
    return r.recordset[0];
  },

  async getPasswordHistory(userId, count) {
    if (!count) return [];
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .input('Count', sql.Int, count)
      .execute('sp_GetPasswordHistory');
    return r.recordset.map((row) => row.PasswordHash);
  },
};

module.exports = UserModel;
