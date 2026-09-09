const { sql, getPool } = require('../config/db');

const PaymentModel = {
  async listAll({ page = 1, pageSize = 20, status = 'all' } = {}) {
    const pool   = await getPool();
    const startRow = ((page - 1) * pageSize) + 1;
    const endRow = page * pageSize;

    if (status !== 'all') {
      const result = await pool.request()
        .input('StartRow', sql.Int,        startRow)
        .input('EndRow',   sql.Int,        endRow)
        .input('Status',   sql.VarChar(20), status)
        .query(`
          WITH PaymentData AS (
            SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
                   p.Provider, p.Amount, p.Currency, p.PlanName,
                   p.Status, p.CreatedAt, p.ProviderPaymentId,
                   ROW_NUMBER() OVER (ORDER BY p.CreatedAt DESC) AS RowNum
            FROM dbo.Payments p
            JOIN dbo.Users u ON u.UserId = p.UserId
            WHERE p.Status = @Status
          )
          SELECT PaymentId, UserId, FullName, Email, Provider, Amount, 
                 Currency, PlanName, Status, CreatedAt, ProviderPaymentId
          FROM PaymentData
          WHERE RowNum BETWEEN @StartRow AND @EndRow
          ORDER BY RowNum
        `);
      return result.recordset;
    }

    const result = await pool.request()
      .input('StartRow', sql.Int, startRow)
      .input('EndRow',   sql.Int, endRow)
      .query(`
        WITH PaymentData AS (
          SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
                 p.Provider, p.Amount, p.Currency, p.PlanName,
                 p.Status, p.CreatedAt, p.ProviderPaymentId,
                 ROW_NUMBER() OVER (ORDER BY p.CreatedAt DESC) AS RowNum
          FROM dbo.Payments p
          JOIN dbo.Users u ON u.UserId = p.UserId
        )
        SELECT PaymentId, UserId, FullName, Email, Provider, Amount, 
               Currency, PlanName, Status, CreatedAt, ProviderPaymentId
        FROM PaymentData
        WHERE RowNum BETWEEN @StartRow AND @EndRow
        ORDER BY RowNum
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
