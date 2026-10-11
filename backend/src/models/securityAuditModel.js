const { sql, getPool } = require('../config/db');

const SecurityAuditModel = {
  async log({ userId = null, eventType, identifier = null, ip = null, userAgent = null, meta = null }) {
    const pool = await getPool();
    await pool.request()
      .input('UserId', sql.Int, userId)
      .input('EventType', sql.VarChar(50), eventType)
      .input('Identifier', sql.Char(16), identifier)
      .input('IpAddress', sql.VarChar(64), ip)
      .input('UserAgent', sql.NVarChar(200), userAgent)
      .input('MetaJson', sql.NVarChar(sql.MAX), meta ? JSON.stringify(meta) : null)
      .execute('sp_LogSecurityEvent');
  },
};

module.exports = SecurityAuditModel;
