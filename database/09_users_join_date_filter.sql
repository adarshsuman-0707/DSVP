/* =========================================================================
   09_users_join_date_filter.sql
   Adds @JoinedFrom/@JoinedTo range filter to sp_GetUsersPaged for the
   Admin Users page's "Join Date" filter.
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

IF OBJECT_ID('dbo.sp_GetUsersPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetUsersPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetUsersPaged
  @Page INT, @PageSize INT,
  @Search NVARCHAR(255) = NULL,
  @Role VARCHAR(20) = NULL,
  @Status VARCHAR(20) = NULL,
  @Plan VARCHAR(20) = NULL,
  @JoinedFrom DATETIME2 = NULL,
  @JoinedTo DATETIME2 = NULL,
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
      AND (@JoinedFrom IS NULL OR CreatedAt >= @JoinedFrom)
      AND (@JoinedTo IS NULL OR CreatedAt < DATEADD(day, 1, @JoinedTo))
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
      AND (@JoinedFrom IS NULL OR CreatedAt >= @JoinedFrom)
      AND (@JoinedTo IS NULL OR CreatedAt < DATEADD(day, 1, @JoinedTo))
  )
  SELECT UserId, FullName, Email, Role, Status, IsPremium, SubscriptionPlan, CreatedAt, LastLoginAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO
