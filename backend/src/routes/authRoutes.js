const express = require('express');
const router = express.Router();
const { register, login, me, changePassword, sendOtp, verifyOtp, resetPassword, sendSignupOtp, verifySignupOtp } = require('../controllers/authController');
const { getNonce, googleLogin } = require('../controllers/googleAuthController');
const { verifyTokenAllowRestricted } = require('../middleware/authMiddleware');
const { loginLimiter, googleLimiter, changePasswordLimiter, otpSendLimiter, otpVerifyLimiter, resetPasswordLimiter } = require('../middleware/rateLimitMiddleware');

router.post('/register', register);
router.post('/login', loginLimiter, login);

// A temp-password session is restricted: only these two routes accept it.
router.get('/me', verifyTokenAllowRestricted, me);
router.post('/change-password', verifyTokenAllowRestricted, changePasswordLimiter, changePassword);

// Google sign-in (ID-token + single-use nonce)
router.get('/google/nonce', googleLimiter, getNonce);
router.post('/google', googleLimiter, googleLogin);

// Signup OTP verification
router.post('/signup/send-otp',   otpSendLimiter,   sendSignupOtp);
router.post('/signup/verify-otp', otpVerifyLimiter, verifySignupOtp);

// Forgot password flow (no auth required)
router.post('/forgot-password/send-otp',   otpSendLimiter,       sendOtp);
router.post('/forgot-password/verify-otp', otpVerifyLimiter,     verifyOtp);
router.post('/forgot-password/reset',      resetPasswordLimiter, resetPassword);

module.exports = router;
