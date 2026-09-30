/* =========================================================================
   17. Activity feed: code runs now show module name + error message

   ExecutionTraces already has Status ('success'|'compile_error'|
   'runtime_error') and ErrorMessage; the app now persists failed runs too.
   sp_GetActivityPaged's 'code_run' rows previously showed only
   "<language> · <status>" — this adds the module name and (for failures)
   the first 300 chars of the error. Idempotent.
   ========================================================================= */

IF OBJECT_ID('dbo.sp_GetActivityPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetActivityPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetActivityPaged
  @Page INT, @PageSize INT,
  @Type VARCHAR(20) = NULL,
  @Search NVARCHAR(255) = NULL,
  @UserId INT = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH ActivityData AS (
    SELECT ae.EventId AS ActivityId, ae.UserId, u.FullName, u.Email,
           ae.EventType AS Type, ae.MetaJson AS Detail, ae.CreatedAt
    FROM dbo.AnalyticsEvents ae JOIN dbo.Users u ON u.UserId = ae.UserId
    UNION ALL
    SELECT et.TraceId, et.UserId, u.FullName, u.Email, 'code_run',
           ISNULL(m.Name + ' · ', '') + et.Language + ' · ' + et.Status
             + ISNULL(' · ' + LEFT(et.ErrorMessage, 300), ''),
           et.CreatedAt
    FROM dbo.ExecutionTraces et
    JOIN dbo.Users u ON u.UserId = et.UserId
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    UNION ALL
    SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
           'payment', p.PlanName + ' · ' + p.Status + ' · ' + p.Currency + ' ' + CAST(p.Amount AS VARCHAR(20)), p.CreatedAt
    FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
  ),
  Filtered AS (
    SELECT * FROM ActivityData
    WHERE (@Type IS NULL OR Type = @Type)
      AND (@UserId IS NULL OR UserId = @UserId)
      AND (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH ActivityData AS (
    SELECT ae.EventId AS ActivityId, ae.UserId, u.FullName, u.Email,
           ae.EventType AS Type, ae.MetaJson AS Detail, ae.CreatedAt
    FROM dbo.AnalyticsEvents ae JOIN dbo.Users u ON u.UserId = ae.UserId
    UNION ALL
    SELECT et.TraceId, et.UserId, u.FullName, u.Email, 'code_run',
           ISNULL(m.Name + ' · ', '') + et.Language + ' · ' + et.Status
             + ISNULL(' · ' + LEFT(et.ErrorMessage, 300), ''),
           et.CreatedAt
    FROM dbo.ExecutionTraces et
    JOIN dbo.Users u ON u.UserId = et.UserId
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    UNION ALL
    SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
           'payment', p.PlanName + ' · ' + p.Status + ' · ' + p.Currency + ' ' + CAST(p.Amount AS VARCHAR(20)), p.CreatedAt
    FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
  ),
  Filtered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM ActivityData
    WHERE (@Type IS NULL OR Type = @Type)
      AND (@UserId IS NULL OR UserId = @UserId)
      AND (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
  )
  SELECT ActivityId, UserId, FullName, Email, Type, Detail, CreatedAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO
