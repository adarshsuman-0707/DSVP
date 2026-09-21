/* =========================================================================
   08_token_version.sql
   Server-side session/token invalidation: a per-user TokenVersion baked
   into every JWT at login. Admin block/deactivate/reset-password bumps it,
   which immediately invalidates every previously-issued token for that
   user on their very next request (checked in authMiddleware).
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'TokenVersion'
)
BEGIN
  ALTER TABLE dbo.Users ADD TokenVersion INT NOT NULL
    CONSTRAINT DF_Users_TokenVersion DEFAULT 1;
END
GO

/* Widen OtpCode to fit a random link-style reset token (admin-triggered
   reset flow reuses this table but stores a long random token instead of
   a short typed digit code). */
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'PasswordResetOtp' AND COLUMN_NAME = 'OtpCode' AND CHARACTER_MAXIMUM_LENGTH < 64
)
BEGIN
  ALTER TABLE dbo.PasswordResetOtp ALTER COLUMN OtpCode VARCHAR(64) NOT NULL;
END
GO

/* ── sp_GetUsersPaged: add @Plan filter (SubscriptionPlan) ── */
IF OBJECT_ID('dbo.sp_GetUsersPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetUsersPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetUsersPaged
  @Page INT, @PageSize INT,
  @Search NVARCHAR(255) = NULL,
  @Role VARCHAR(20) = NULL,
  @Status VARCHAR(20) = NULL,
  @Plan VARCHAR(20) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH Filtered AS (
    SELECT UserId, FullName, Email, Role, Status, IsPremium, SubscriptionPlan, CreatedAt, LastLoginAt
    FROM dbo.Users
    WHERE (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
      AND (@Role IS NULL OR Role = @Role)
      AND (@Status IS NULL OR Status = @Status)
      AND (@Plan IS NULL OR ISNULL(SubscriptionPlan,'free') = @Plan)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT UserId, FullName, Email, Role, Status, IsPremium, SubscriptionPlan, CreatedAt, LastLoginAt,
           ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM dbo.Users
    WHERE (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
      AND (@Role IS NULL OR Role = @Role)
      AND (@Status IS NULL OR Status = @Status)
      AND (@Plan IS NULL OR ISNULL(SubscriptionPlan,'free') = @Plan)
  )
  SELECT UserId, FullName, Email, Role, Status, IsPremium, SubscriptionPlan, CreatedAt, LastLoginAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO
