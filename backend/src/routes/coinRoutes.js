const express = require('express');
const router = express.Router();
const { getWallet, getTransactions, getDiscountQuote, redeemModuleUnlock } = require('../controllers/coinController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/wallet', getWallet);
router.get('/transactions', getTransactions);
router.get('/quote', getDiscountQuote);
router.post('/redeem/module-unlock', redeemModuleUnlock);

module.exports = router;
