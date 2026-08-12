const { sql, getPool } = require('../config/db');

const UserModel = {
  async createUser({ fullName, email, passwordHash }) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('FullName', sql.NVarChar(150), fullName)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(255), passwordHash)
      .query(`
        INSERT INTO dbo.Users (FullName, Email, PasswordHash, SubscriptionPlan)
        OUTPUT INSERTED.UserId, INSERTED.FullName, INSERTED.Email, INSERTED.Role, INSERTED.IsPremium,
               INSERTED.SubscriptionPlan, INSERTED.SubscriptionExpiry, INSERTED.PremiumModulesAccess
        VALUES (@FullName, @Email, @PasswordHash, 'free')
      `);
    return result.recordset[0];
  },

  async findByEmail(email) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('Email', sql.NVarChar(255), email)
      .query('SELECT * FROM dbo.Users WHERE Email = @Email');
    return result.recordset[0];
  },

  async findById(userId) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, userId)
      .query(`
        SELECT UserId, FullName, Email, Role, IsPremium, AvatarUrl, CreatedAt, LastLoginAt,
               SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess
        FROM dbo.Users WHERE UserId = @UserId
      `);
    return result.recordset[0];
  },

  async updateLastLogin(userId) {
    const pool = await getPool();
    await pool
      .request()
      .input('UserId', sql.Int, userId)
      .query('UPDATE dbo.Users SET LastLoginAt = SYSUTCDATETIME() WHERE UserId = @UserId');
  },

  async listAll({ page = 1, pageSize = 20 } = {}) {
    const pool = await getPool();
    const offset = (page - 1) * pageSize;
    const result = await pool
      .request()
      .input('Offset', sql.Int, offset)
      .input('PageSize', sql.Int, pageSize)
      .query(`
        SELECT UserId, FullName, Email, Role, IsPremium, CreatedAt, LastLoginAt,
               SubscriptionPlan, SubscriptionExpiry
        FROM dbo.Users
        ORDER BY CreatedAt DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);
    return result.recordset;
  },
};

module.exports = UserModel;
