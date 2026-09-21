const { sql, getPool } = require('../config/db');

const FeedbackModel = {
  async listPaged({ page = 1, pageSize = 20, status = null } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('Page', sql.Int, page);
    req.input('PageSize', sql.Int, pageSize);
    req.input('Status', sql.VarChar(20), status || null);
    req.output('TotalRecords', sql.Int);
    const result = await req.execute('sp_GetFeedbackPaged');
    return { rows: result.recordset, total: result.output.TotalRecords };
  },

  async deleteById(feedbackId) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId', sql.Int, feedbackId)
      .execute('sp_DeleteFeedback');
  },

  async updateStatus(feedbackId, status) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId', sql.Int, feedbackId)
      .input('Status', sql.VarChar(20), status)
      .execute('sp_UpdateFeedbackStatus');
  },

  async setReply(feedbackId, replyText) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId', sql.Int, feedbackId)
      .input('AdminReply', sql.NVarChar(sql.MAX), replyText)
      .execute('sp_SetFeedbackReply');
  },

  async listForUser(userId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .execute('sp_ListFeedbackForUser');
    return r.recordset;
  },

  async markSeen(feedbackId, userId) {
    const pool = await getPool();
    await pool.request()
      .input('FeedbackId', sql.Int, feedbackId)
      .input('UserId', sql.Int, userId)
      .execute('sp_MarkFeedbackSeen');
  },

  async countUnseenForUser(userId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .execute('sp_CountUnseenFeedbackForUser');
    return r.recordset[0].total;
  },
};

module.exports = FeedbackModel;
