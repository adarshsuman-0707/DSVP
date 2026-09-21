const CoinModel = require('../models/coinModel');
const { buildEnvelope, parsePaging } = require('../utils/paginate');

// GET /api/coins/wallet
async function getWallet(req, res, next) {
  try {
    const wallet = await CoinModel.getWallet(req.user.userId);
    const activeUnlocks = await CoinModel.getActiveModuleUnlocks(req.user.userId);
    res.json({
      coinsUnlocked: !!wallet.CoinsUnlocked,
      coinBalance: wallet.CoinBalance,
      coinRate: CoinModel.COIN_RATE,
      moduleUnlockCost: CoinModel.MODULE_UNLOCK_COST,
      activeModuleUnlocks: activeUnlocks,
    });
  } catch (err) { next(err); }
}

// GET /api/coins/transactions?page=1&pageSize=20
async function getTransactions(req, res, next) {
  try {
    const { page, pageSize } = parsePaging(req.query);
    const { rows, total } = await CoinModel.listTransactionsPaged(req.user.userId, { page, pageSize });
    res.json(buildEnvelope(rows, page, pageSize, total));
  } catch (err) { next(err); }
}

// GET /api/coins/quote?coins=200&amount=99
async function getDiscountQuote(req, res, next) {
  try {
    const coins = parseInt(req.query.coins, 10) || 0;
    const amount = parseFloat(req.query.amount) || 0;
    const wallet = await CoinModel.getWallet(req.user.userId);
    const affordable = Math.min(coins, wallet.CoinBalance);
    const discount = wallet.CoinsUnlocked ? CoinModel.quoteDiscount(affordable, amount) : 0;
    res.json({
      coinsUnlocked: !!wallet.CoinsUnlocked,
      coinBalance: wallet.CoinBalance,
      discount,
      coinsUsed: discount * CoinModel.COIN_RATE,
      maxDiscountPct: CoinModel.MAX_DISCOUNT_PCT,
    });
  } catch (err) { next(err); }
}

// POST /api/coins/redeem/module-unlock  body: { moduleId }
async function redeemModuleUnlock(req, res, next) {
  try {
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ message: 'moduleId is required' });

    const cost = CoinModel.MODULE_UNLOCK_COST;
    const expiresAt = await CoinModel.unlockModuleWithCoins(req.user.userId, moduleId, cost, 7);
    res.json({ message: 'Module unlocked for 7 days', expiresAt, coinsSpent: cost });
  } catch (err) {
    if (err.message === 'Insufficient coin balance' || err.message === 'Coins not unlocked for this account') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
}

module.exports = { getWallet, getTransactions, getDiscountQuote, redeemModuleUnlock };
