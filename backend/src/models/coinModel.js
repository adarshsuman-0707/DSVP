const { sql, getPool } = require('../config/db');

const COIN_RATE = 10;        // 10 coins = ₹1 discount
const MAX_DISCOUNT_PCT = 0.4; // a redemption can cover at most 40% of the order

const CoinModel = {
  async getWallet(userId) {
    const pool = await getPool();
    const r = await pool.request().input('UserId', sql.Int, userId).execute('sp_GetCoinWallet');
    return r.recordset[0] || { CoinsUnlocked: false, CoinBalance: 0 };
  },

  /**
   * The single write path for every coin grant. No-ops silently (Applied=0)
   * if the user hasn't unlocked coins yet — every caller can fire-and-forget
   * without checking unlock status itself first.
   */
  async earn(userId, amount, reason, description = null) {
    const pool = await getPool();
    const req = pool.request();
    req.input('UserId', sql.Int, userId);
    req.input('Amount', sql.Int, amount);
    req.input('Reason', sql.VarChar(40), reason);
    req.input('Description', sql.NVarChar(300), description);
    req.output('NewBalance', sql.Int);
    req.output('Applied', sql.Bit);
    const result = await req.execute('sp_EarnCoins');
    return { applied: !!result.output.Applied, balance: result.output.NewBalance };
  },

  /** Flips CoinsUnlocked on a user's first successful purchase. Grants no
   *  coins itself — earning starts from the next qualifying action. */
  async unlock(userId) {
    const pool = await getPool();
    const req = pool.request();
    req.input('UserId', sql.Int, userId);
    req.output('WasAlreadyUnlocked', sql.Bit);
    const result = await req.execute('sp_UnlockCoins');
    return !result.output.WasAlreadyUnlocked; // true if this call newly unlocked it
  },

  async listTransactionsPaged(userId, { page = 1, pageSize = 20 } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('UserId', sql.Int, userId);
    req.input('Page', sql.Int, page);
    req.input('PageSize', sql.Int, pageSize);
    req.output('TotalRecords', sql.Int);
    const result = await req.execute('sp_GetCoinTransactionsPaged');
    return { rows: result.recordset, total: result.output.TotalRecords };
  },

  async getAdminSummary() {
    const pool = await getPool();
    const result = await pool.request().execute('sp_GetCoinAdminSummary');
    return result.recordset[0];
  },

  /**
   * Has this user already earned this dedupable reason? A single proc,
   * `sp_CheckCoinEarned`, driven by a @Mode flag instead of one proc per
   * check — 'today' guards once-per-day (login), 'since' guards once-per-
   * N-days (feedback), 'for' guards once-ever-per-key (module_complete
   * per module slug). All three only differ in the CreatedAt/Description
   * predicate, so one parameterized proc covers them.
   */
  async _checkEarned(userId, reason, mode, { days = null, description = null } = {}) {
    const pool = await getPool();
    const req = pool.request();
    req.input('UserId', sql.Int, userId);
    req.input('Reason', sql.VarChar(40), reason);
    req.input('Mode', sql.VarChar(10), mode);
    req.input('Days', sql.Int, days);
    req.input('Description', sql.NVarChar(300), description);
    req.output('Found', sql.Bit);
    const result = await req.execute('sp_CheckCoinEarned');
    return !!result.output.Found;
  },

  hasEarnedToday(userId, reason) {
    return this._checkEarned(userId, reason, 'today');
  },

  hasEarnedSince(userId, reason, days) {
    return this._checkEarned(userId, reason, 'since', { days });
  },

  hasEarnedFor(userId, reason, description) {
    return this._checkEarned(userId, reason, 'for', { description });
  },

  // ── Redemption: discount quote ──
  quoteDiscount(coins, orderAmountRupees) {
    const rupees = Math.floor(coins / COIN_RATE);
    const cap = Math.floor(orderAmountRupees * MAX_DISCOUNT_PCT);
    return Math.max(0, Math.min(rupees, cap));
  },

  coinsForRupees(rupees) {
    return rupees * COIN_RATE;
  },

  async redeemCoins(userId, coins, reason, description) {
    const wallet = await this.getWallet(userId);
    if (!wallet.CoinsUnlocked) throw new Error('Coins not unlocked for this account');
    if (wallet.CoinBalance < coins) throw new Error('Insufficient coin balance');
    return this.earn(userId, -coins, reason, description);
  },

  // ── Redemption: temporary module unlock ──
  async unlockModuleWithCoins(userId, moduleId, coins, days = 7) {
    const pool = await getPool();
    await this.redeemCoins(userId, coins, 'redeem_module_unlock', `Module #${moduleId} unlocked for ${days} days`);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await pool.request()
      .input('UserId', sql.Int, userId)
      .input('ModuleId', sql.Int, moduleId)
      .input('ExpiresAt', sql.DateTime2, expiresAt)
      .execute('sp_InsertCoinModuleUnlock');
    return expiresAt;
  },

  async getActiveModuleUnlocks(userId) {
    const pool = await getPool();
    const r = await pool.request().input('UserId', sql.Int, userId).execute('sp_GetActiveCoinModuleUnlocks');
    return r.recordset;
  },

  MODULE_UNLOCK_COST: 300,
  COIN_RATE,
  MAX_DISCOUNT_PCT,
};

module.exports = CoinModel;
