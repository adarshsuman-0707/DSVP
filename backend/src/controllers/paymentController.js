const crypto = require('crypto');
const Razorpay = require('razorpay');
const { sql, getPool } = require('../config/db');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order for subscription payment
 */
async function createOrder(req, res, next) {
  try {
    const { plan, amount } = req.body;
    if (!plan || !amount) {
      return res.status(400).json({ message: 'plan and amount are required' });
    }

    // Validate plan
    if (!['basic', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan. Choose basic or premium' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: 'rcpt_' + crypto.randomBytes(8).toString('hex'),
      notes: { userId: String(req.user.userId), plan },
    });

    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Provider', sql.VarChar(20), 'razorpay')
      .input('Amount', sql.Decimal(10, 2), amount)
      .input('Currency', sql.VarChar(10), 'INR')
      .input('PlanName', sql.NVarChar(100), plan)
      .input('ProviderOrderId', sql.NVarChar(150), order.id)
      .query(`
        INSERT INTO dbo.Payments (UserId, Provider, Amount, Currency, PlanName, Status, ProviderOrderId)
        OUTPUT INSERTED.PaymentId
        VALUES (@UserId, @Provider, @Amount, @Currency, @PlanName, 'pending', @ProviderOrderId)
      `);

    res.status(201).json({
      paymentId: result.recordset[0].PaymentId,
      orderId: order.id,
      amount: order.amount, // already in paise
      currency: order.currency,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/verify
 * Verify Razorpay payment signature and upgrade user subscription
 */
async function verifyPayment(req, res, next) {
  try {
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ message: 'orderId, paymentId and signature are required' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    if (expectedSignature !== signature) {
      const pool = await getPool();
      await pool.request()
        .input('ProviderOrderId', sql.NVarChar(150), orderId)
        .query(`UPDATE dbo.Payments SET Status='failed' WHERE ProviderOrderId=@ProviderOrderId AND Status='pending'`);
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const pool = await getPool();

    // Get payment details
    const paymentResult = await pool
      .request()
      .input('ProviderOrderId', sql.NVarChar(150), orderId)
      .query(`
        SELECT PaymentId, UserId, PlanName
        FROM dbo.Payments
        WHERE ProviderOrderId = @ProviderOrderId AND Status = 'pending'
      `);

    if (!paymentResult.recordset.length) {
      return res.status(404).json({ message: 'Payment not found or already processed' });
    }

    const payment = paymentResult.recordset[0];

    // Update payment status
    await pool
      .request()
      .input('PaymentId', sql.Int, payment.PaymentId)
      .input('ProviderPaymentId', sql.NVarChar(150), paymentId)
      .query(`
        UPDATE dbo.Payments
        SET Status = 'success', ProviderPaymentId = @ProviderPaymentId
        WHERE PaymentId = @PaymentId
      `);

    // Calculate subscription expiry (1 month from now)
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    // Update user subscription
    await pool
      .request()
      .input('UserId', sql.Int, payment.UserId)
      .input('SubscriptionPlan', sql.NVarChar(20), payment.PlanName)
      .input('SubscriptionExpiry', sql.DateTime, expiryDate)
      .query(`
        UPDATE dbo.Users
        SET IsPremium = 1,
            SubscriptionPlan = @SubscriptionPlan,
            SubscriptionExpiry = @SubscriptionExpiry
        WHERE UserId = @UserId
      `);

    res.json({
      message: 'Payment verified successfully',
      plan: payment.PlanName,
      expiresAt: expiryDate
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder, verifyPayment };
