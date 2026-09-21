const { sql, getPool } = require('../config/db');

const PaymentModel = {
  async listPaged({ page = 1, pageSize = 20, status = null, userId = null, search = '' } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('Page', sql.Int, page);
    req.input('PageSize', sql.Int, pageSize);
    req.input('Status', sql.VarChar(20), status || null);
    req.input('UserId', sql.Int, userId || null);
    req.input('Search', sql.NVarChar(255), search || null);
    req.output('TotalRecords', sql.Int);
    const result = await req.execute('sp_GetPaymentsPaged');
    return { rows: result.recordset, total: result.output.TotalRecords };
  },

  async totalRevenue() {
    const pool = await getPool();
    const r = await pool.request().execute('sp_GetPaymentTotalRevenue');
    return r.recordset[0].total;
  },

  async findById(paymentId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('PaymentId', sql.Int, paymentId)
      .execute('sp_FindPaymentById');
    return r.recordset[0];
  },

  async findByOrderId(orderId) {
    const pool = await getPool();
    const r = await pool.request()
      .input('ProviderOrderId', sql.NVarChar(150), orderId)
      .execute('sp_FindPaymentByOrderId');
    return r.recordset[0];
  },

  async countSuccessForUser(userId, excludePaymentId = null) {
    const pool = await getPool();
    const r = await pool.request()
      .input('UserId', sql.Int, userId)
      .input('ExcludeId', sql.Int, excludePaymentId)
      .execute('sp_CountSuccessPaymentsForUser');
    return r.recordset[0].total;
  },

  async setCoinRedemption(paymentId, coinsRedeemed, discountAmount) {
    const pool = await getPool();
    await pool.request()
      .input('PaymentId', sql.Int, paymentId)
      .input('CoinsRedeemed', sql.Int, coinsRedeemed)
      .input('DiscountAmount', sql.Decimal(10, 2), discountAmount)
      .execute('sp_SetPaymentCoinRedemption');
  },

  async updateStatus(paymentId, { status, providerPaymentId = null, paymentMethod = null, failureReason = null }) {
    const pool = await getPool();
    await pool.request()
      .input('PaymentId', sql.Int, paymentId)
      .input('Status', sql.VarChar(20), status)
      .input('ProviderPaymentId', sql.NVarChar(150), providerPaymentId)
      .input('PaymentMethod', sql.NVarChar(30), paymentMethod)
      .input('FailureReason', sql.NVarChar(500), failureReason)
      .execute('sp_UpdatePaymentStatus');
  },

  async listForUser(userId, { page = 1, pageSize = 20 } = {}) {
    return this.listPaged({ page, pageSize, userId });
  },

  // ── Webhook idempotency ──
  async hasProcessedEvent(razorpayEventId) {
    const pool = await getPool();
    const req = pool.request();
    req.input('RazorpayEventId', sql.NVarChar(150), razorpayEventId);
    req.output('Found', sql.Bit);
    const result = await req.execute('sp_HasProcessedWebhookEvent');
    return !!result.output.Found;
  },

  async recordEvent(razorpayEventId, eventType, payload) {
    const pool = await getPool();
    const req = pool.request();
    req.input('RazorpayEventId', sql.NVarChar(150), razorpayEventId);
    req.input('EventType', sql.VarChar(50), eventType);
    req.input('Payload', sql.NVarChar(sql.MAX), payload ? JSON.stringify(payload) : null);
    req.output('Inserted', sql.Bit);
    const result = await req.execute('sp_RecordWebhookEvent');
    return !!result.output.Inserted;
  },
};

module.exports = PaymentModel;
