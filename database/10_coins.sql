/* =========================================================================
   10_coins.sql
   DSVP Coins — a loyalty currency that starts accruing only AFTER a user's
   first successful plan purchase (CoinsUnlocked flips true then, first
   purchase itself earns 0 coins — it just opens the door). Redeemable for
   a discount on the next purchase, or a temporary module unlock.
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'CoinsUnlocked')
  ALTER TABLE dbo.Users ADD CoinsUnlocked BIT NOT NULL CONSTRAINT DF_Users_CoinsUnlocked DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'CoinBalance')
  ALTER TABLE dbo.Users ADD CoinBalance INT NOT NULL CONSTRAINT DF_Users_CoinBalance DEFAULT 0;
GO

IF OBJECT_ID('dbo.CoinTransactions') IS NULL
BEGIN
  CREATE TABLE dbo.CoinTransactions (
    TransactionId INT IDENTITY(1,1) PRIMARY KEY,
    UserId        INT NOT NULL CONSTRAINT FK_CoinTx_User REFERENCES dbo.Users(UserId),
    Amount        INT NOT NULL,              -- positive = earn, negative = redeem/spend
    Reason        VARCHAR(40) NOT NULL,      -- login | streak_bonus | module_complete | clean_run_streak
                                              -- | feedback | referral | renewal | redeem_discount
                                              -- | redeem_module_unlock | admin_adjust
    Description   NVARCHAR(300) NULL,
    BalanceAfter  INT NOT NULL,
    CreatedAt     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_CoinTx_User_Created ON dbo.CoinTransactions(UserId, CreatedAt DESC);
END
GO

IF OBJECT_ID('dbo.CoinModuleUnlocks') IS NULL
BEGIN
  CREATE TABLE dbo.CoinModuleUnlocks (
    UnlockId  INT IDENTITY(1,1) PRIMARY KEY,
    UserId    INT NOT NULL CONSTRAINT FK_CoinUnlock_User REFERENCES dbo.Users(UserId),
    ModuleId  INT NOT NULL CONSTRAINT FK_CoinUnlock_Module REFERENCES dbo.Modules(ModuleId),
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_CoinUnlock_User ON dbo.CoinModuleUnlocks(UserId, ModuleId, ExpiresAt);
END
GO

/* ── sp_EarnCoins: the single write path for every coin grant.
     No-ops (returns 0 change) if the user hasn't unlocked coins yet. ── */
IF OBJECT_ID('dbo.sp_EarnCoins') IS NULL EXEC('CREATE PROCEDURE dbo.sp_EarnCoins AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_EarnCoins
  @UserId INT, @Amount INT, @Reason VARCHAR(40), @Description NVARCHAR(300) = NULL,
  @NewBalance INT OUTPUT, @Applied BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Unlocked BIT;
  SELECT @Unlocked = CoinsUnlocked, @NewBalance = CoinBalance FROM dbo.Users WHERE UserId = @UserId;

  IF @Unlocked IS NULL OR @Unlocked = 0 OR @Amount = 0
  BEGIN
    SET @Applied = 0;
    RETURN;
  END

  UPDATE dbo.Users SET CoinBalance = CoinBalance + @Amount WHERE UserId = @UserId;
  SELECT @NewBalance = CoinBalance FROM dbo.Users WHERE UserId = @UserId;

  INSERT INTO dbo.CoinTransactions (UserId, Amount, Reason, Description, BalanceAfter)
  VALUES (@UserId, @Amount, @Reason, @Description, @NewBalance);

  SET @Applied = 1;
END
GO

/* ── sp_UnlockCoins: flips CoinsUnlocked on first successful purchase.
     Deliberately does NOT grant any coins itself — per spec, the first
     purchase only opens the door; earning starts from the next action. ── */
IF OBJECT_ID('dbo.sp_UnlockCoins') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UnlockCoins AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UnlockCoins
  @UserId INT, @WasAlreadyUnlocked BIT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT @WasAlreadyUnlocked = CoinsUnlocked FROM dbo.Users WHERE UserId = @UserId;
  IF @WasAlreadyUnlocked IS NULL SET @WasAlreadyUnlocked = 0;
  IF @WasAlreadyUnlocked = 0
    UPDATE dbo.Users SET CoinsUnlocked = 1 WHERE UserId = @UserId;
END
GO

/* ── sp_GetCoinTransactionsPaged ── */
IF OBJECT_ID('dbo.sp_GetCoinTransactionsPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetCoinTransactionsPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetCoinTransactionsPaged
  @UserId INT, @Page INT, @PageSize INT, @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;

  SELECT @TotalRecords = COUNT(*) FROM dbo.CoinTransactions WHERE UserId = @UserId;

  ;WITH Filtered AS (
    SELECT TransactionId, UserId, Amount, Reason, Description, BalanceAfter, CreatedAt,
           ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM dbo.CoinTransactions
    WHERE UserId = @UserId
  )
  SELECT TransactionId, UserId, Amount, Reason, Description, BalanceAfter, CreatedAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

/* ── sp_GetCoinAdminSummary — KPI cards for Admin → Coins ── */
IF OBJECT_ID('dbo.sp_GetCoinAdminSummary') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetCoinAdminSummary AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetCoinAdminSummary
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    (SELECT COUNT(*) FROM dbo.Users WHERE CoinsUnlocked = 1) AS UnlockedUsers,
    (SELECT ISNULL(SUM(CoinBalance),0) FROM dbo.Users) AS TotalCoinsOutstanding,
    (SELECT ISNULL(SUM(Amount),0) FROM dbo.CoinTransactions WHERE Amount > 0) AS TotalCoinsEarned,
    (SELECT ISNULL(SUM(-Amount),0) FROM dbo.CoinTransactions WHERE Amount < 0) AS TotalCoinsRedeemed;
END
GO
