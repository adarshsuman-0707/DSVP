const { sql, getPool } = require('../config/db');

/**
 * POST /api/payments/create-order
 * Creates a payment record + (in production) an order with Razorpay/Stripe.
 */
async function createOrder(req, res, next) {
  try {
    const { planName, amount, provider = 'razorpay', currency = 'INR' } = req.body;
    if (!planName || !amount) {
      return res.status(400).json({ message: 'planName and amount are required' });
    }

    // TODO: call Razorpay/Stripe SDK here to create a real order,
    // then store the returned ProviderOrderId.
    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Provider', sql.VarChar(20), provider)
      .input('Amount', sql.Decimal(10, 2), amount)
      .input('Currency', sql.VarChar(10), currency)
      .input('PlanName', sql.NVarChar(100), planName)
      .query(`
        INSERT INTO dbo.Payments (UserId, Provider, Amount, Currency, PlanName, Status)
        OUTPUT INSERTED.PaymentId
        VALUES (@UserId, @Provider, @Amount, @Currency, @PlanName, 'pending')
      `);

    res.status(201).json({ paymentId: result.recordset[0].PaymentId });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/verify
 * Webhook/callback: mark payment success + upgrade user to premium.
 */
async function verifyPayment(req, res, next) {
  try {
    const { paymentId, providerPaymentId } = req.body;

    const pool = await getPool();
    await pool
      .request()
      .input('PaymentId', sql.Int, paymentId)
      .input('ProviderPaymentId', sql.NVarChar(150), providerPaymentId)
      .query(`
        UPDATE dbo.Payments
        SET Status = 'success', ProviderPaymentId = @ProviderPaymentId
        WHERE PaymentId = @PaymentId
      `);

    await pool
      .request()
      .input('UserId', sql.Int, req.user.userId)
      .query('UPDATE dbo.Users SET IsPremium = 1 WHERE UserId = @UserId');

    res.json({ message: 'Payment verified, premium activated' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, verifyPayment };
