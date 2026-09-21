/* =========================================================================
   11_coins_payment_fields.sql
   Tracks a coin-discount redemption alongside its payment, so the actual
   coin deduction can happen at payment SUCCESS (not at order-creation,
   which would lose coins on an abandoned checkout).
   Idempotent — safe to re-run.
   ========================================================================= */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'CoinsRedeemed')
  ALTER TABLE dbo.Payments ADD CoinsRedeemed INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'DiscountAmount')
  ALTER TABLE dbo.Payments ADD DiscountAmount DECIMAL(10,2) NULL;
GO
