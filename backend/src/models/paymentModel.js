const { sql, getPool } = require('../config/db');

const PaymentModel = {
  async listAll({ page = 1, pageSize = 20, status = 'all' } = {}) {
    const pool   = await getPool();
    const offset = (page - 1) * pageSize;

    if (status !== 'all') {
      const result = await pool.request()
        .input('Offset',   sql.Int,        offset)
        .input('PageSize', sql.Int,        pageSize)
        .input('Status',   sql.VarChar(20), status)
        .query(`
          SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
                 p.Provider, p.Amount, p.Currency, p.PlanName,
                 p.Status, p.CreatedAt, p.ProviderPaymentId
          FROM dbo.Payments p
          JOIN dbo.Users u ON u.UserId = p.UserId
          WHERE p.Status = @Status
          ORDER BY p.CreatedAt DESC
          OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `);
      return result.recordset;
    }

    const result = await pool.request()
      .input('Offset',   sql.Int, offset)
      .input('PageSize', sql.Int, pageSize)
      .query(`
        SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
               p.Provider, p.Amount, p.Currency, p.PlanName,
               p.Status, p.CreatedAt, p.ProviderPaymentId
        FROM dbo.Payments p
        JOIN dbo.Users u ON u.UserId = p.UserId
        ORDER BY p.CreatedAt DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);
    return result.recordset;
  },

  async countAll({ status = 'all' } = {}) {
    const pool = await getPool();
    if (status !== 'all') {
      const r = await pool.request()
        .input('Status', sql.VarChar(20), status)
        .query(`SELECT COUNT(*) AS total FROM dbo.Payments WHERE Status = @Status`);
      return r.recordset[0].total;
    }
    const r = await pool.request()
      .query(`SELECT COUNT(*) AS total FROM dbo.Payments`);
    return r.recordset[0].total;
  },

  async totalRevenue() {
    const pool = await getPool();
    const r    = await pool.request()
      .query(`SELECT ISNULL(SUM(Amount),0) AS total FROM dbo.Payments WHERE Status='success'`);
    return r.recordset[0].total;
  },
};

module.exports = PaymentModel;
