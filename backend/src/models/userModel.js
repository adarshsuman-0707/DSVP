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
};

module.exports = UserModel;
