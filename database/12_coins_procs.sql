/* =========================================================================
   12_coins_procs.sql
   Converts the remaining raw-SQL paths in coinModel.js to stored
   procedures. The three "has this dedup-reason already fired?" checks
   (today / since N days / exact description match) are collapsed into
   ONE procedure driven by an @Mode flag instead of three near-identical
   procs, since they only differ in the CreatedAt/Description predicate.
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

/* ── sp_GetCoinWallet ── */
IF OBJECT_ID('dbo.sp_GetCoinWallet') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetCoinWallet AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetCoinWallet
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT CoinsUnlocked, CoinBalance FROM dbo.Users WHERE UserId = @UserId;
END
GO

/* ── sp_CheckCoinEarned — @Mode flag selects which dedup window to check:
     'today'  → same UTC calendar date
     'since'  → CreatedAt >= now - @Days
     'for'    → exact match on Reason + Description (e.g. one award per
                module slug, regardless of when it happened)          ── */
IF OBJECT_ID('dbo.sp_CheckCoinEarned') IS NULL EXEC('CREATE PROCEDURE dbo.sp_CheckCoinEarned AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_CheckCoinEarned
  @UserId INT,
  @Reason VARCHAR(40),
  @Mode VARCHAR(10),              -- 'today' | 'since' | 'for'
  @Days INT = NULL,               -- required when @Mode = 'since'
  @Description NVARCHAR(300) = NULL, -- required when @Mode = 'for'
  @Found BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET @Found = 0;

  IF @Mode = 'today'
  BEGIN
    IF EXISTS (
      SELECT 1 FROM dbo.CoinTransactions
      WHERE UserId = @UserId AND Reason = @Reason
        AND CAST(CreatedAt AS DATE) = CAST(SYSUTCDATETIME() AS DATE)
    ) SET @Found = 1;
  END
  ELSE IF @Mode = 'since'
  BEGIN
    IF EXISTS (
      SELECT 1 FROM dbo.CoinTransactions
      WHERE UserId = @UserId AND Reason = @Reason
        AND CreatedAt >= DATEADD(day, -@Days, SYSUTCDATETIME())
    ) SET @Found = 1;
  END
  ELSE IF @Mode = 'for'
  BEGIN
    IF EXISTS (
      SELECT 1 FROM dbo.CoinTransactions
      WHERE UserId = @UserId AND Reason = @Reason AND Description = @Description
    ) SET @Found = 1;
  END
END
GO

/* ── sp_InsertCoinModuleUnlock ── */
IF OBJECT_ID('dbo.sp_InsertCoinModuleUnlock') IS NULL EXEC('CREATE PROCEDURE dbo.sp_InsertCoinModuleUnlock AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_InsertCoinModuleUnlock
  @UserId INT, @ModuleId INT, @ExpiresAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.CoinModuleUnlocks (UserId, ModuleId, ExpiresAt)
  VALUES (@UserId, @ModuleId, @ExpiresAt);
END
GO

/* ── sp_GetActiveCoinModuleUnlocks ── */
IF OBJECT_ID('dbo.sp_GetActiveCoinModuleUnlocks') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetActiveCoinModuleUnlocks AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetActiveCoinModuleUnlocks
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT ModuleId, ExpiresAt FROM dbo.CoinModuleUnlocks
  WHERE UserId = @UserId AND ExpiresAt > SYSUTCDATETIME();
END
GO
