/* =========================================================================
   18_google_auth.sql
   Google sign-in + temporary-password / mandatory-first-change support.
   Idempotent — safe to re-run. SQL Server 2008 compatible (no THROW, no
   CREATE OR ALTER, no OFFSET/FETCH).

   Adds:
     Users.MustChangePassword / TempPasswordExpiresAt / PasswordChangedAt
     Users.WelcomeEmailSentAt / WelcomeEmailClaimedAt
     dbo.UserOAuthIdentities  (provider + immutable subject -> user)
     dbo.OAuthNonces          (single-use, expiring nonces; replay guard)
   ========================================================================= */

/* ── Users columns ───────────────────────────────────────────────────── */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'MustChangePassword')
  ALTER TABLE dbo.Users ADD MustChangePassword BIT NOT NULL CONSTRAINT DF_Users_MustChangePassword DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'TempPasswordExpiresAt')
  ALTER TABLE dbo.Users ADD TempPasswordExpiresAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'PasswordChangedAt')
  ALTER TABLE dbo.Users ADD PasswordChangedAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'WelcomeEmailSentAt')
  ALTER TABLE dbo.Users ADD WelcomeEmailSentAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'WelcomeEmailClaimedAt')
  ALTER TABLE dbo.Users ADD WelcomeEmailClaimedAt DATETIME2 NULL;
GO

/* ── OAuth identities ────────────────────────────────────────────────── */
IF OBJECT_ID('dbo.UserOAuthIdentities', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserOAuthIdentities (
    IdentityId     INT IDENTITY(1,1) PRIMARY KEY,
    UserId         INT           NOT NULL
                     CONSTRAINT FK_UserOAuth_Users REFERENCES dbo.Users(UserId) ON DELETE CASCADE,
    Provider       VARCHAR(20)   NOT NULL,           -- 'google'
    ProviderUserId NVARCHAR(255) NOT NULL,           -- Google "sub" (immutable)
    Email          NVARCHAR(255) NOT NULL,           -- email asserted at link time
    LinkedAt       DATETIME2     NOT NULL CONSTRAINT DF_UserOAuth_LinkedAt DEFAULT SYSUTCDATETIME(),
    LastLoginAt    DATETIME2     NULL,
    CONSTRAINT UQ_UserOAuth_ProviderSubject UNIQUE (Provider, ProviderUserId),
    CONSTRAINT UQ_UserOAuth_UserProvider    UNIQUE (UserId, Provider)
  );
END
GO

/* ── Single-use nonces (hash only; raw nonce never stored) ───────────── */
IF OBJECT_ID('dbo.OAuthNonces', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.OAuthNonces (
    NonceHash CHAR(64)  NOT NULL PRIMARY KEY,         -- SHA-256 hex
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_OAuthNonces_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END
GO

/* ── Nonces ──────────────────────────────────────────────────────────── */
IF OBJECT_ID('dbo.sp_OAuthNonceCreate') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OAuthNonceCreate AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OAuthNonceCreate
  @NonceHash CHAR(64), @ExpiresAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM dbo.OAuthNonces WHERE ExpiresAt < SYSUTCDATETIME();   -- opportunistic cleanup
  INSERT INTO dbo.OAuthNonces (NonceHash, ExpiresAt) VALUES (@NonceHash, @ExpiresAt);
END
GO

/* Atomic consume: returns 1 row only for the first caller with an unexpired nonce. */
IF OBJECT_ID('dbo.sp_OAuthNonceConsume') IS NULL EXEC('CREATE PROCEDURE dbo.sp_OAuthNonceConsume AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_OAuthNonceConsume
  @NonceHash CHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM dbo.OAuthNonces
  OUTPUT DELETED.NonceHash
  WHERE NonceHash = @NonceHash AND ExpiresAt >= SYSUTCDATETIME();
END
GO

/* ── Lookups ─────────────────────────────────────────────────────────── */
IF OBJECT_ID('dbo.sp_FindUserByOAuthIdentity') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindUserByOAuthIdentity AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindUserByOAuthIdentity
  @Provider VARCHAR(20), @ProviderUserId NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT u.* FROM dbo.UserOAuthIdentities i
  JOIN dbo.Users u ON u.UserId = i.UserId
  WHERE i.Provider = @Provider AND i.ProviderUserId = @ProviderUserId;
END
GO

/* Credential record used by the password-change flow. */
IF OBJECT_ID('dbo.sp_GetPasswordRecord') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetPasswordRecord AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetPasswordRecord
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT UserId, Email, FullName, Status, PasswordHash, MustChangePassword, TempPasswordExpiresAt
  FROM dbo.Users WHERE UserId = @UserId;
END
GO

/* sp_FindUserAuthById now also reports the password-change state, so the
   middleware can re-check it from the DB on every request. */
ALTER PROCEDURE dbo.sp_FindUserAuthById
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT UserId, Role, Status, TokenVersion, SubscriptionPlan, PremiumModulesAccess,
         MustChangePassword, TempPasswordExpiresAt
  FROM dbo.Users WHERE UserId = @UserId;
END
GO

/* ── Find-or-create-or-link, atomic ──────────────────────────────────────
   Result columns: all Users columns + Created BIT + Linked BIT.
   @PasswordHash / @TempPasswordExpiresAt are used ONLY when a brand-new
   user row is inserted. Duplicate-key races (two concurrent first logins)
   surface as error 2601/2627, which the caller retries once; the retry
   then takes the "already exists" branch.                                  */
IF OBJECT_ID('dbo.sp_UpsertGoogleUser') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpsertGoogleUser AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpsertGoogleUser
  @ProviderUserId NVARCHAR(255),
  @Email NVARCHAR(255),
  @FullName NVARCHAR(150),
  @AvatarUrl NVARCHAR(500) = NULL,
  @PasswordHash NVARCHAR(255),
  @TempPasswordExpiresAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  DECLARE @UserId INT, @Created BIT = 0, @Linked BIT = 0;

  BEGIN TRANSACTION;

  SELECT @UserId = UserId FROM dbo.UserOAuthIdentities WITH (UPDLOCK, HOLDLOCK)
  WHERE Provider = 'google' AND ProviderUserId = @ProviderUserId;

  IF @UserId IS NULL
  BEGIN
    SELECT @UserId = UserId FROM dbo.Users WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email;

    IF @UserId IS NULL
    BEGIN
      INSERT INTO dbo.Users (FullName, Email, PasswordHash, SubscriptionPlan, AvatarUrl,
                             MustChangePassword, TempPasswordExpiresAt, WelcomeEmailClaimedAt)
      VALUES (@FullName, @Email, @PasswordHash, 'free', @AvatarUrl,
              1, @TempPasswordExpiresAt, SYSUTCDATETIME());
      SET @UserId = SCOPE_IDENTITY();
      SET @Created = 1;
    END
    ELSE
      SET @Linked = 1;

    INSERT INTO dbo.UserOAuthIdentities (UserId, Provider, ProviderUserId, Email, LastLoginAt)
    VALUES (@UserId, 'google', @ProviderUserId, @Email, SYSUTCDATETIME());

    /* Linking to a password account ends every session issued before the
       link, so a session opened by someone who pre-registered the address
       cannot survive the real owner claiming it through Google. */
    IF @Linked = 1
      UPDATE dbo.Users SET TokenVersion = TokenVersion + 1, UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
  END
  ELSE
    UPDATE dbo.UserOAuthIdentities SET LastLoginAt = SYSUTCDATETIME()
    WHERE Provider = 'google' AND ProviderUserId = @ProviderUserId;

  SELECT u.*, @Created AS Created, @Linked AS Linked FROM dbo.Users u WHERE u.UserId = @UserId;

  COMMIT TRANSACTION;
END
GO

/* ── Welcome-email claim / completion ────────────────────────────────────
   Claim succeeds (returns a row) for exactly one caller when the account
   is still waiting on its first credentials email: temp password pending,
   email never sent, and no live claim within the last 2 minutes. The
   winner receives a freshly rotated hash (retry path) — callers on the
   create path already hold a claim, so they use sp_MarkWelcomeEmailSent
   directly.                                                                */
IF OBJECT_ID('dbo.sp_RotateTempPasswordForResend') IS NULL EXEC('CREATE PROCEDURE dbo.sp_RotateTempPasswordForResend AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_RotateTempPasswordForResend
  @UserId INT, @PasswordHash NVARCHAR(255), @TempPasswordExpiresAt DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (UserId INT);
  UPDATE dbo.Users
  SET PasswordHash = @PasswordHash, TempPasswordExpiresAt = @TempPasswordExpiresAt,
      WelcomeEmailClaimedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
  OUTPUT INSERTED.UserId INTO @out (UserId)
  WHERE UserId = @UserId AND MustChangePassword = 1 AND WelcomeEmailSentAt IS NULL
    AND (WelcomeEmailClaimedAt IS NULL OR WelcomeEmailClaimedAt < DATEADD(minute, -2, SYSUTCDATETIME()));
  SELECT UserId FROM @out;
END
GO

IF OBJECT_ID('dbo.sp_MarkWelcomeEmailSent') IS NULL EXEC('CREATE PROCEDURE dbo.sp_MarkWelcomeEmailSent AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_MarkWelcomeEmailSent
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET WelcomeEmailSentAt = SYSUTCDATETIME() WHERE UserId = @UserId;
END
GO

/* Delivery failed: release the claim so the next Google sign-in retries. */
IF OBJECT_ID('dbo.sp_ReleaseWelcomeEmailClaim') IS NULL EXEC('CREATE PROCEDURE dbo.sp_ReleaseWelcomeEmailClaim AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_ReleaseWelcomeEmailClaim
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET WelcomeEmailClaimedAt = NULL WHERE UserId = @UserId AND WelcomeEmailSentAt IS NULL;
END
GO

/* ── Mandatory / voluntary password change ── */
IF OBJECT_ID('dbo.sp_CompletePasswordChange') IS NULL EXEC('CREATE PROCEDURE dbo.sp_CompletePasswordChange AS SELECT 1');
GO
/* Compare-and-set on the old hash: if two requests race with the same
   temporary password only one UPDATE matches (single-use). Bumps
   TokenVersion so every older JWT dies; returns the new version.          */
ALTER PROCEDURE dbo.sp_CompletePasswordChange
  @UserId INT, @OldPasswordHash NVARCHAR(255), @NewPasswordHash NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (UserId INT, FullName NVARCHAR(150), Email NVARCHAR(255), Role VARCHAR(20), IsPremium BIT, SubscriptionPlan NVARCHAR(20), SubscriptionExpiry DATETIME, PremiumModulesAccess NVARCHAR(MAX), TokenVersion INT, CoinsUnlocked BIT, CoinBalance INT, CreatedAt DATETIME2);
  UPDATE dbo.Users
  SET PasswordHash = @NewPasswordHash,
      MustChangePassword = 0, TempPasswordExpiresAt = NULL,
      PasswordChangedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME(),
      TokenVersion = TokenVersion + 1
  OUTPUT INSERTED.UserId, INSERTED.FullName, INSERTED.Email, INSERTED.Role, INSERTED.IsPremium,
         INSERTED.SubscriptionPlan, INSERTED.SubscriptionExpiry, INSERTED.PremiumModulesAccess,
         INSERTED.TokenVersion, INSERTED.CoinsUnlocked, INSERTED.CoinBalance, INSERTED.CreatedAt
  INTO @out (UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion, CoinsUnlocked, CoinBalance, CreatedAt)
  WHERE UserId = @UserId AND PasswordHash = @OldPasswordHash AND Status = 'active';
  SELECT UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion, CoinsUnlocked, CoinBalance, CreatedAt FROM @out;
END
GO

/* Any other password write (forgot-password, voluntary change) also ends
   the temporary-password state.                                            */
ALTER PROCEDURE dbo.sp_UpdateUserPasswordHash
  @UserId INT, @PasswordHash NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users
  SET PasswordHash = @PasswordHash, MustChangePassword = 0, TempPasswordExpiresAt = NULL,
      PasswordChangedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
  WHERE UserId = @UserId;
END
GO
