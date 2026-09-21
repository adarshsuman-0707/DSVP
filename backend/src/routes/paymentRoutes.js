const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, webhook, myPayments } = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/create-order', verifyToken, createOrder);
router.post('/verify', verifyToken, verifyPayment);
router.get('/my-payments', verifyToken, myPayments);

// Webhook: no verifyToken — Razorpay calls this server-to-server; the HMAC
// signature over the raw body is the authentication. Raw body parsing for
// this exact path is wired in app.js (must run before express.json()).
router.post('/webhook', webhook);

module.exports = router;
