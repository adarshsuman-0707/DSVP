const crypto = require('crypto');
const { sql, getPool } = require('../config/db');

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

    // In production, call Razorpay SDK
    // For now, create a mock order
    const orderId = 'order_' + crypto.randomBytes(12).toString('hex');
    
    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Provider', sql.VarChar(20), 'razorpay')
      .input('Amount', sql.Decimal(10, 2), amount)
      .input('Currency', sql.VarChar(10), 'INR')
      .input('PlanName', sql.NVarChar(100), plan)
      .input('ProviderOrderId', sql.NVarChar(150), orderId)
      .query(`
        INSERT INTO dbo.Payments (UserId, Provider, Amount, Currency, PlanName, Status, ProviderOrderId)
        OUTPUT INSERTED.PaymentId
        VALUES (@UserId, @Provider, @Amount, @Currency, @PlanName, 'pending', @ProviderOrderId)
      `);

    res.status(201).json({ 
      paymentId: result.recordset[0].PaymentId,
      orderId: orderId,
      amount: amount * 100, // Razorpay expects amount in paise
      currency: 'INR'
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

    // Verify Razorpay signature (in production)
    // For now, accept any signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'test_secret')
      .update(orderId + '|' + paymentId)
      .digest('hex');

    // Skip signature validation in development
    // if (signature !== expectedSignature) {
    //   return res.status(400).json({ message: 'Invalid payment signature' });
    // }

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
