const { sql, getPool } = require('../config/db');

const FeedbackModel = {
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
          WITH FeedbackData AS (
            SELECT f.FeedbackId, f.UserId, u.FullName, u.Email,
                   f.Subject, f.Message, f.Status, f.CreatedAt,
                   ROW_NUMBER() OVER (ORDER BY f.CreatedAt DESC) AS RowNum
            FROM dbo.Feedback f
            LEFT JOIN dbo.Users u ON u.UserId = f.UserId
            WHERE f.Status = @Status
          )
          SELECT FeedbackId, UserId, FullName, Email, Subject, Message, Status, CreatedAt
          FROM FeedbackData
          WHERE RowNum BETWEEN @StartRow AND @EndRow
          ORDER BY RowNum
        `);
      return result.recordset;
    }

    const result = await pool.request()
      .input('StartRow', sql.Int, startRow)
      .input('EndRow',   sql.Int, endRow)
      .query(`
        WITH FeedbackData AS (
          SELECT f.FeedbackId, f.UserId, u.FullName, u.Email,
                 f.Subject, f.Message, f.Status, f.CreatedAt,
                 ROW_NUMBER() OVER (ORDER BY f.CreatedAt DESC) AS RowNum
          FROM dbo.Feedback f
          LEFT JOIN dbo.Users u ON u.UserId = f.UserId
        )
        SELECT FeedbackId, UserId, FullName, Email, Subject, Message, Status, CreatedAt
        FROM FeedbackData
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
        .query(`SELECT COUNT(*) AS total FROM dbo.Feedback WHERE Status = @Status`);
      return r.recordset[0].total;
    }
    const r = await pool.request()
      .query(`SELECT COUNT(*) AS total FROM dbo.Feedback`);
    return r.recordset[0].total;
  },

  async updateStatus(feedbackId, status) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId', sql.Int,        feedbackId)
      .input('Status',     sql.VarChar(20), status)
      .query(`UPDATE dbo.Feedback SET Status=@Status WHERE FeedbackId=@FeedbackId`);
  },
};

module.exports = FeedbackModel;
