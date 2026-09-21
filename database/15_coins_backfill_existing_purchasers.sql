/* =========================================================================
   15_coins_backfill_existing_purchasers.sql
   One-time backfill: any user with at least one successful payment made
   BEFORE the Coins feature existed never had CoinsUnlocked flipped (that
   only happens inside verifyPayment/webhook at the moment of a NEW
   successful payment). Without this, every pre-existing paying customer
   would stay locked out of coins forever despite having already paid.
   Grants no coins — same rule as a fresh first purchase, just applied
   retroactively. Idempotent (only touches users still at CoinsUnlocked=0),
   safe to re-run.
   ========================================================================= */

UPDATE u
SET u.CoinsUnlocked = 1
FROM dbo.Users u
WHERE u.CoinsUnlocked = 0
  AND EXISTS (
    SELECT 1 FROM dbo.Payments p
    WHERE p.UserId = u.UserId AND p.Status = 'success'
  );
GO
