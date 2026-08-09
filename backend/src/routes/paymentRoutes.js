const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment } = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/create-order', verifyToken, createOrder);
router.post('/verify', verifyToken, verifyPayment);

module.exports = router;
