/* =========================================================================
   19_password_policy.sql
   Centralized password policy support. Idempotent; SQL Server 2008 safe.
   Run AFTER 18_google_auth.sql.

   Adds:
     dbo.PasswordHistory     previous hashes, for "no reuse" rules
     dbo.SecurityAuditLog    credential-free security events
     OTP / reset-token procs (replace raw SQL in the auth controller;
       sp_OtpConsume is an atomic single-use consume)
     sp_CompletePasswordChange: now also archives the old hash, trims
       history, works for reset flows (@OldPasswordHash NULL), and rejects
       inactive/blocked users.
   ========================================================================= */

IF OBJECT_ID('dbo.PasswordHistory', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PasswordHistory (
    HistoryId    INT IDENTITY(1,1) PRIMARY KEY,
    UserId       INT           NOT NULL
                   CONSTRAINT FK_PasswordHistory_Users REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    PasswordHash NVARCHAR(255) NOT NULL,
    CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_PasswordHistory_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_PasswordHistory_User ON dbo.PasswordHistory (UserId, HistoryId);
END
GO

/* No FK on UserId: audit rows must survive account deletion. Identifier is a
   truncated SHA-256 of the email (lets us correlate attempts on unknown
   accounts without storing the address). Never holds credentials. */
IF OBJECT_ID('dbo.SecurityAuditLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.SecurityAuditLog (
    EventId    BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId     INT           NULL,
    EventType  VARCHAR(50)   NOT NULL,
    Identifier CHAR(16)      NULL,
    IpAddress  VARCHAR(64)   NULL,
    UserAgent  NVARCHAR(200) NULL,
    MetaJson   NVARCHAR(MAX) NULL,
    CreatedAt  DATETIME2     NOT NULL CONSTRAINT DF_SecurityAuditLog_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_SecurityAuditLog_User ON dbo.SecurityAuditLog (UserId, CreatedAt);
  CREATE INDEX IX_SecurityAuditLog_Type ON dbo.SecurityAuditLog (EventType, CreatedAt);
END
GO

IF OBJECT_ID('dbo.sp_LogSecurityEvent') IS NULL EXEC('CREATE PROCEDURE dbo.sp_LogSecurityEvent AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_LogSecurityEvent
  @UserId INT = NULL, @EventType VARCHAR(50), @Identifier CHAR(16) = NULL,
  @IpAddress VARCHAR(64) = NULL, @UserAgent NVARCHAR(200) = NULL, @MetaJson NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.SecurityAuditLog (UserId, EventType, Identifier, IpAddress, UserAgent, MetaJson)
  VALUES (@UserId, @EventType, @Identifier, @IpAddress, @UserAgent, @MetaJson);
END
GO

IF OBJECT_ID('dbo.sp_GetPasswordHistory') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetPasswordHistory AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetPasswordHistory
  @UserId INT, @Count INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (@Count) PasswordHash FROM dbo.PasswordHistory
  WHERE UserId = @UserId ORDER BY HistoryId DESC;
END
GO

/* ── Password change / reset (single transaction) ────────────────────────
   @OldPasswordHash: compare-and-set guard (change flow). NULL for reset
   flows, which authorise via the single-use reset token instead.
   Returns the updated user row, or NO row if the user is missing / not
   active / the guard failed.                                               */
ALTER PROCEDURE dbo.sp_CompletePasswordChange
  @UserId INT,
  @OldPasswordHash NVARCHAR(255) = NULL,
  @NewPasswordHash NVARCHAR(255),
  @HistoryKeep INT = 5
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @Current NVARCHAR(255), @Status VARCHAR(20);

  BEGIN TRANSACTION;

  SELECT @Current = PasswordHash, @Status = Status
  FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE UserId = @UserId;

  IF @Current IS NULL OR @Status <> 'active' OR (@OldPasswordHash IS NOT NULL AND @Current <> @OldPasswordHash)
  BEGIN
    ROLLBACK TRANSACTION;
    RETURN;
  END

  IF @HistoryKeep > 0
  BEGIN
    INSERT INTO dbo.PasswordHistory (UserId, PasswordHash) VALUES (@UserId, @Current);
    DELETE FROM dbo.PasswordHistory
    WHERE UserId = @UserId
      AND HistoryId NOT IN (SELECT TOP (@HistoryKeep) HistoryId FROM dbo.PasswordHistory
                            WHERE UserId = @UserId ORDER BY HistoryId DESC);
  END

  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (UserId INT, FullName NVARCHAR(150), Email NVARCHAR(255), Role VARCHAR(20), IsPremium BIT, SubscriptionPlan NVARCHAR(20), SubscriptionExpiry DATETIME, PremiumModulesAccess NVARCHAR(MAX), TokenVersion INT, CoinsUnlocked BIT, CoinBalance INT, CreatedAt DATETIME2);
  UPDATE dbo.Users
  SET PasswordHash = @NewPasswordHash,
      MustChangePassword = 0, TempPasswordExpiresAt = NULL,
      PasswordChangedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(),
      TokenVersion = TokenVersion + 1          -- every older JWT dies
  OUTPUT INSERTED.UserId, INSERTED.FullName, INSERTED.Email, INSERTED.Role, INSERTED.IsPremium,
         INSERTED.SubscriptionPlan, INSERTED.SubscriptionExpiry, INSERTED.PremiumModulesAccess,
         INSERTED.TokenVersion, INSERTED.CoinsUnlocked, INSERTED.CoinBalance, INSERTED.CreatedAt
  INTO @out (UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion, CoinsUnlocked, CoinBalance, CreatedAt)
  WHERE UserId = @UserId;

  COMMIT TRANSACTION;
  SELECT UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion, CoinsUnlocked, CoinBalance, CreatedAt FROM @out;
END
GO

/* ── OTP / reset tokens (table: PasswordResetOtp) ────────────────────── */
IF OBJECT_ID('dbo.sp_OtpInvalidate') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OtpInvalidate AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OtpInvalidate
  @Email NVARCHAR(255), @OnlySignup BIT = 0
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.PasswordResetOtp SET Used = 1
  WHERE Email = @Email AND Used = 0 AND (@OnlySignup = 0 OR OtpCode LIKE 'S%');
END
GO

IF OBJECT_ID('dbo.sp_OtpCreate') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OtpCreate AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OtpCreate
  @Email NVARCHAR(255), @OtpCode VARCHAR(64), @ExpiresAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (OtpId INT);
  INSERT INTO dbo.PasswordResetOtp (Email, OtpCode, ExpiresAt)
  OUTPUT INSERTED.OtpId INTO @out (OtpId)
  VALUES (@Email, @OtpCode, @ExpiresAt);
  SELECT OtpId FROM @out;
END
GO

IF OBJECT_ID('dbo.sp_OtpFindLatest') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OtpFindLatest AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OtpFindLatest
  @Email NVARCHAR(255), @OtpCode VARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 OtpId, ExpiresAt, Used FROM dbo.PasswordResetOtp
  WHERE Email = @Email AND OtpCode = @OtpCode ORDER BY CreatedAt DESC;
END
GO

/* Atomic single-use: only the first caller with an unexpired, unused id gets a row. */
IF OBJECT_ID('dbo.sp_OtpConsume') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OtpConsume AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OtpConsume
  @OtpId INT
AS
BEGIN
  SET NOCOUNT ON;
  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (OtpId INT, Email NVARCHAR(255));
  UPDATE dbo.PasswordResetOtp SET Used = 1
  OUTPUT INSERTED.OtpId, INSERTED.Email INTO @out (OtpId, Email)
  WHERE OtpId = @OtpId AND Used = 0 AND ExpiresAt >= SYSUTCDATETIME();
  SELECT OtpId, Email FROM @out;
END
GO

IF OBJECT_ID('dbo.sp_OtpGet') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OtpGet AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OtpGet
  @OtpId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT OtpId, Email, ExpiresAt, Used FROM dbo.PasswordResetOtp WHERE OtpId = @OtpId;
END
GO
