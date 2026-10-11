/* =========================================================================
   13_usermodel_procs.sql
   Converts every remaining raw-SQL method in userModel.js to a stored
   procedure. Idempotent — safe to re-run. SQL Server 2008 compatible
   (uses the create-stub-then-ALTER idiom, no CREATE OR ALTER).
   ========================================================================= */

IF OBJECT_ID('dbo.sp_CreateUser') IS NULL EXEC('CREATE PROCEDURE dbo.sp_CreateUser AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_CreateUser
  @FullName NVARCHAR(150), @Email NVARCHAR(255), @PasswordHash NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  -- OUTPUT ... INTO a table variable: a bare OUTPUT is rejected (Msg 334) when the
  -- target table has ANY enabled trigger (e.g. an activity-log trigger).
  DECLARE @out TABLE (UserId INT, FullName NVARCHAR(150), Email NVARCHAR(255), Role VARCHAR(20), IsPremium BIT, SubscriptionPlan NVARCHAR(20), SubscriptionExpiry DATETIME, PremiumModulesAccess NVARCHAR(MAX), TokenVersion INT);
  INSERT INTO dbo.Users (FullName, Email, PasswordHash, SubscriptionPlan)
  OUTPUT INSERTED.UserId, INSERTED.FullName, INSERTED.Email, INSERTED.Role, INSERTED.IsPremium,
         INSERTED.SubscriptionPlan, INSERTED.SubscriptionExpiry, INSERTED.PremiumModulesAccess,
         INSERTED.TokenVersion
  INTO @out (UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion)
  VALUES (@FullName, @Email, @PasswordHash, 'free');
  SELECT UserId, FullName, Email, Role, IsPremium, SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, TokenVersion FROM @out;
END
GO

IF OBJECT_ID('dbo.sp_FindUserByEmail') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindUserByEmail AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindUserByEmail
  @Email NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT * FROM dbo.Users WHERE Email = @Email;
END
GO

IF OBJECT_ID('dbo.sp_FindUserById') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindUserById AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindUserById
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT UserId, FullName, Email, Role, Status, IsPremium, AvatarUrl, CreatedAt, LastLoginAt,
         SubscriptionPlan, SubscriptionExpiry, PremiumModulesAccess, CoinsUnlocked, CoinBalance
  FROM dbo.Users WHERE UserId = @UserId;
END
GO

IF OBJECT_ID('dbo.sp_FindUserAuthById') IS NULL EXEC('CREATE PROCEDURE dbo.sp_FindUserAuthById AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_FindUserAuthById
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT UserId, Role, Status, TokenVersion, SubscriptionPlan, PremiumModulesAccess
  FROM dbo.Users WHERE UserId = @UserId;
END
GO

IF OBJECT_ID('dbo.sp_IncrementTokenVersion') IS NULL EXEC('CREATE PROCEDURE dbo.sp_IncrementTokenVersion AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_IncrementTokenVersion
  @UserId INT, @NewTokenVersion INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET TokenVersion = TokenVersion + 1, UpdatedAt = SYSUTCDATETIME()
  WHERE UserId = @UserId;
  SELECT @NewTokenVersion = TokenVersion FROM dbo.Users WHERE UserId = @UserId;
END
GO

IF OBJECT_ID('dbo.sp_UpdateLastLogin') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpdateLastLogin AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpdateLastLogin
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET LastLoginAt = SYSUTCDATETIME() WHERE UserId = @UserId;
END
GO

IF OBJECT_ID('dbo.sp_LogAnalyticsEvent') IS NULL EXEC('CREATE PROCEDURE dbo.sp_LogAnalyticsEvent AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_LogAnalyticsEvent
  @UserId INT, @EventType VARCHAR(50), @MetaJson NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.AnalyticsEvents (UserId, EventType, MetaJson) VALUES (@UserId, @EventType, @MetaJson);
END
GO

/* Replaces the old listAll (which used OFFSET/FETCH — unsupported on this
   SQL Server 2008 instance, and was already unreferenced dead code). */
IF OBJECT_ID('dbo.sp_ListAllUsersPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_ListAllUsersPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_ListAllUsersPaged
  @Page INT, @PageSize INT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;

  ;WITH Filtered AS (
    SELECT UserId, FullName, Email, Role, IsPremium, CreatedAt, LastLoginAt,
           SubscriptionPlan, SubscriptionExpiry,
           ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM dbo.Users
  )
  SELECT UserId, FullName, Email, Role, IsPremium, CreatedAt, LastLoginAt, SubscriptionPlan, SubscriptionExpiry
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_GetUserStatusSummary') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetUserStatusSummary AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetUserStatusSummary
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    COUNT(*) AS TotalUsers,
    SUM(CASE WHEN Status = 'active'   THEN 1 ELSE 0 END) AS ActiveUsers,
    SUM(CASE WHEN Status = 'inactive' THEN 1 ELSE 0 END) AS InactiveUsers,
    SUM(CASE WHEN Status = 'blocked'  THEN 1 ELSE 0 END) AS BlockedUsers
  FROM dbo.Users;
END
GO

IF OBJECT_ID('dbo.sp_UpdateUserPasswordHash') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpdateUserPasswordHash AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpdateUserPasswordHash
  @UserId INT, @PasswordHash NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET PasswordHash = @PasswordHash, UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
END
GO
