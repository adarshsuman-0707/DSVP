const { sql, getPool } = require('../config/db');

const AuditLogModel = {
  async insert({ adminId, action, targetType, targetId = null, description = null, ip = null }) {
    const pool = await getPool();
    await pool.request()
      .input('AdminId',     sql.Int,          adminId)
      .input('Action',      sql.VarChar(50),  action)
      .input('TargetType',  sql.VarChar(30),  targetType)
      .input('TargetId',    sql.Int,          targetId)
      .input('Description', sql.NVarChar(500), description)
      .input('IPAddress',   sql.VarChar(64),  ip)
      .execute('sp_InsertAuditLog');
  },

  async listPaged({ page = 1, pageSize = 20, search = '' } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('Page', sql.Int, page);
    req.input('PageSize', sql.Int, pageSize);
    req.input('Search', sql.NVarChar(255), search || null);
    req.output('TotalRecords', sql.Int);
    const result = await req.execute('sp_GetAuditLogsPaged');
    return { rows: result.recordset, total: result.output.TotalRecords };
  },
};

module.exports = AuditLogModel;
