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
                   f.AdminReply, f.RespondedAt, f.UserSeen,
                   ROW_NUMBER() OVER (ORDER BY f.CreatedAt DESC) AS RowNum
            FROM dbo.Feedback f
            LEFT JOIN dbo.Users u ON u.UserId = f.UserId
            WHERE f.Status = @Status
          )
          SELECT FeedbackId, UserId, FullName, Email, Subject, Message, Status, CreatedAt,
                 AdminReply, RespondedAt, UserSeen
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
                 f.AdminReply, f.RespondedAt, f.UserSeen,
                 ROW_NUMBER() OVER (ORDER BY f.CreatedAt DESC) AS RowNum
          FROM dbo.Feedback f
          LEFT JOIN dbo.Users u ON u.UserId = f.UserId
        )
        SELECT FeedbackId, UserId, FullName, Email, Subject, Message, Status, CreatedAt,
               AdminReply, RespondedAt, UserSeen
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
    // UserSeen=0 whenever admin changes status — the submitting user
    // should be notified their feedback moved, not left to wonder.
    await pool.request()
      .input('FeedbackId', sql.Int,        feedbackId)
      .input('Status',     sql.VarChar(20), status)
      .query(`UPDATE dbo.Feedback SET Status=@Status, UserSeen=0 WHERE FeedbackId=@FeedbackId`);
  },

  async setReply(feedbackId, replyText) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId',  sql.Int,             feedbackId)
      .input('AdminReply',  sql.NVarChar(sql.MAX), replyText)
      .query(`
        UPDATE dbo.Feedback
        SET AdminReply = @AdminReply, RespondedAt = SYSUTCDATETIME(), UserSeen = 0
        WHERE FeedbackId = @FeedbackId
      `);
  },

  async listForUser(userId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .query(`
        SELECT FeedbackId, Subject, Message, Status, AdminReply, RespondedAt, UserSeen, CreatedAt
        FROM dbo.Feedback
        WHERE UserId = @UserId
        ORDER BY CreatedAt DESC
      `);
    return r.recordset;
  },

  async markSeen(feedbackId, userId) {
    const pool = await getPool();
    // Scoped to the owning user — a user must never be able to mark
    // (or even discover the existence of) someone else's feedback as seen.
    await pool.request()
      .input('FeedbackId', sql.Int, feedbackId)
      .input('UserId',     sql.Int, userId)
      .query(`UPDATE dbo.Feedback SET UserSeen=1 WHERE FeedbackId=@FeedbackId AND UserId=@UserId`);
  },

  async countUnseenForUser(userId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .query(`SELECT COUNT(*) AS total FROM dbo.Feedback WHERE UserId=@UserId AND UserSeen=0`);
    return r.recordset[0].total;
  },
};

module.exports = FeedbackModel;
