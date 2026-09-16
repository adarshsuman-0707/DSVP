const express = require('express');
const router = express.Router();
const { register, login, me, sendOtp, verifyOtp, resetPassword, sendSignupOtp, verifySignupOtp } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.get('/me', verifyToken, me);

// Signup OTP verification
router.post('/signup/send-otp',   sendSignupOtp);
router.post('/signup/verify-otp', verifySignupOtp);

// Forgot password flow (no auth required)
router.post('/forgot-password/send-otp',  sendOtp);
router.post('/forgot-password/verify-otp', verifyOtp);
router.post('/forgot-password/reset',      resetPassword);

module.exports = router;
