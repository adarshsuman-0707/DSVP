const crypto = require('crypto');
const razorpay = require('../services/razorpayClient');
const { sql, getPool } = require('../config/db');
const PaymentModel = require('../models/paymentModel');
const UserModel = require('../models/userModel');
const CoinModel = require('../models/coinModel');
const { generateToken } = require('./authController');
const { buildEnvelope, parsePaging } = require('../utils/paginate');

/**
 * First-ever successful payment unlocks coin-earning going forward (no
 * coins granted for the purchase itself, per spec); every payment after
 * that earns a renewal bonus. Shared by both the client-driven verify path
 * and the webhook safety-net so a payment is only ever credited once
 * however it gets confirmed.
 */
async function applyCoinsForPayment(payment) {
  const priorSuccessCount = await PaymentModel.countSuccessForUser(payment.UserId, payment.PaymentId);
  if (priorSuccessCount === 0) {
    await CoinModel.unlock(payment.UserId);
  } else {
    await CoinModel.earn(payment.UserId, 50, 'renewal', `Renewed ${payment.PlanName}`);
  }
}

/**
 * POST /api/payments/create-order
 * Creates a Razorpay order for subscription payment
 */
async function createOrder(req, res, next) {
  try {
    const { plan, amount, coinsToRedeem = 0 } = req.body;
    if (!plan || !amount) {
      return res.status(400).json({ message: 'plan and amount are required' });
    }

    if (!['basic', 'premium'].includes(plan)) {
      return res.status(400).json({ message: 'Invalid plan. Choose basic or premium' });
    }

    // Coins are only ever DEDUCTED once the payment actually succeeds (see
    // applyCoinsForPayment) — here we just validate the balance covers the
    // requested redemption and compute the discounted order amount, so an
    // abandoned checkout never costs the user coins for nothing.
    let discount = 0;
    let coinsUsed = 0;
    if (coinsToRedeem > 0) {
      const wallet = await CoinModel.getWallet(req.user.userId);
      if (!wallet.CoinsUnlocked) {
        return res.status(400).json({ message: 'Coins are not unlocked for this account yet' });
      }
      if (wallet.CoinBalance < coinsToRedeem) {
        return res.status(400).json({ message: 'Insufficient coin balance' });
      }
      discount = CoinModel.quoteDiscount(coinsToRedeem, amount);
      // Only "spend" the coins that actually produced discount (rounding /
      // the 40%-cap can mean fewer coins are needed than requested).
      coinsUsed = discount * CoinModel.COIN_RATE;
    }

    const finalAmount = Math.max(1, amount - discount);

    const receipt = 'rcpt_' + crypto.randomBytes(8).toString('hex');
    const order = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100), // paise
      currency: 'INR',
      receipt,
      notes: { userId: String(req.user.userId), plan, coinsUsed: String(coinsUsed) },
    });

    const pool = await getPool();
    const result = await pool
      .request()
      .input('UserId', sql.Int, req.user.userId)
      .input('Provider', sql.VarChar(20), 'razorpay')
      .input('Amount', sql.Decimal(10, 2), finalAmount)
      .input('Currency', sql.VarChar(10), 'INR')
      .input('PlanName', sql.NVarChar(100), plan)
      .input('ProviderOrderId', sql.NVarChar(150), order.id)
      .input('Receipt', sql.NVarChar(100), receipt)
      .input('CoinsRedeemed', sql.Int, coinsUsed || null)
      .input('DiscountAmount', sql.Decimal(10, 2), discount || null)
      .query(`
        INSERT INTO dbo.Payments (UserId, Provider, Amount, Currency, PlanName, Status, ProviderOrderId, Receipt, CoinsRedeemed, DiscountAmount)
        OUTPUT INSERTED.PaymentId
        VALUES (@UserId, @Provider, @Amount, @Currency, @PlanName, 'created', @ProviderOrderId, @Receipt, @CoinsRedeemed, @DiscountAmount)
      `);

    await UserModel.logEvent(req.user.userId, 'payment_initiated', { paymentId: result.recordset[0].PaymentId, plan, coinsUsed, discount });

    res.status(201).json({
      paymentId: result.recordset[0].PaymentId,
      orderId: order.id,
      amount: order.amount, // already in paise, post-discount
      currency: order.currency,
      discount,
      coinsUsed,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/verify
 * Verify Razorpay payment signature and upgrade user subscription.
 * This is the client-driven confirmation path; the webhook (below) is the
 * server-to-server safety net in case the browser closes before this fires.
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
      const payment = await PaymentModel.findByOrderId(orderId);
      if (payment) {
        await PaymentModel.updateStatus(payment.PaymentId, { status: 'failed', failureReason: 'Signature mismatch' });
        await UserModel.logEvent(payment.UserId, 'payment_failed', { paymentId: payment.PaymentId, reason: 'Signature mismatch' });
      }
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const payment = await PaymentModel.findByOrderId(orderId);
    if (!payment || !['created', 'pending'].includes(payment.Status)) {
      return res.status(404).json({ message: 'Payment not found or already processed' });
    }

    await PaymentModel.updateStatus(payment.PaymentId, {
      status: 'success',
      providerPaymentId: paymentId,
    });

    if (payment.CoinsRedeemed > 0) {
      await CoinModel.earn(payment.UserId, -payment.CoinsRedeemed, 'redeem_discount',
        `₹${payment.DiscountAmount} off ${payment.PlanName}`);
    }
    await applyCoinsForPayment(payment);

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    const pool = await getPool();
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

    await UserModel.logEvent(payment.UserId, 'payment_success', { paymentId: payment.PaymentId, plan: payment.PlanName });

    // Re-issue the JWT: subscriptionPlan/premiumModulesAccess are baked into
    // the token at login time, so without a fresh token the user would stay
    // locked out of their newly-purchased modules until they log in again.
    const updatedUser = await UserModel.findById(payment.UserId);
    const token = generateToken({ ...updatedUser, Role: updatedUser.Role || 'user' });

    res.json({
      message: 'Payment verified successfully',
      plan: payment.PlanName,
      expiresAt: expiryDate,
      token,
      user: updatedUser,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/webhook
 * Server-to-server Razorpay webhook. Mounted WITHOUT verifyToken (Razorpay
 * calls this directly — the payload signature IS the authentication) and
 * with a raw-body parser (see app.js) since the signature is computed over
 * the exact raw bytes, not the re-serialized JSON.
 */
async function webhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret) {
      return res.status(400).json({ message: 'Webhook not configured' });
    }

    const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    if (expected !== signature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    const eventId = payload.event + ':' + (payload.payload?.payment?.entity?.id || payload.payload?.order?.entity?.id || Date.now());

    // Idempotency — Razorpay may redeliver the same event
    const isNew = await PaymentModel.recordEvent(eventId, payload.event, payload);
    if (!isNew) {
      return res.json({ message: 'Already processed' });
    }

    const entity = payload.payload?.payment?.entity;
    if (entity?.order_id) {
      const payment = await PaymentModel.findByOrderId(entity.order_id);
      if (payment) {
        if (payload.event === 'payment.captured' && payment.Status !== 'success') {
          await PaymentModel.updateStatus(payment.PaymentId, {
            status: 'success',
            providerPaymentId: entity.id,
            paymentMethod: entity.method,
          });
          if (payment.CoinsRedeemed > 0) {
            await CoinModel.earn(payment.UserId, -payment.CoinsRedeemed, 'redeem_discount',
              `₹${payment.DiscountAmount} off ${payment.PlanName}`);
          }
          await applyCoinsForPayment(payment);
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          const pool = await getPool();
          await pool.request()
            .input('UserId', sql.Int, payment.UserId)
            .input('SubscriptionPlan', sql.NVarChar(20), payment.PlanName)
            .input('SubscriptionExpiry', sql.DateTime, expiryDate)
            .query(`UPDATE dbo.Users SET IsPremium=1, SubscriptionPlan=@SubscriptionPlan, SubscriptionExpiry=@SubscriptionExpiry WHERE UserId=@UserId`);
        } else if (payload.event === 'payment.failed') {
          await PaymentModel.updateStatus(payment.PaymentId, {
            status: 'failed',
            paymentMethod: entity.method,
            failureReason: entity.error_description || 'Payment failed',
          });
          await UserModel.logEvent(payment.UserId, 'payment_failed', { paymentId: payment.PaymentId });
        }
      }
    }

    res.json({ message: 'Webhook processed' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/payments/my-payments?page=1&pageSize=20
 * User-scoped payment history.
 */
async function myPayments(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const { rows, total } = await PaymentModel.listForUser(req.user.userId, { page, pageSize });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

module.exports = { createOrder, verifyPayment, webhook, myPayments };
