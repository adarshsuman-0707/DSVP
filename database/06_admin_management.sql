/* =========================================================================
   06_admin_management.sql
   Admin + User management upgrade: status field, payment detail fields,
   audit log, webhook idempotency table, and paginated stored procedures.
   Idempotent — safe to re-run.
   Target: SQL Server 2008 (detected on this instance) — no CREATE OR ALTER
   (2016+), no CONCAT() (2012+); uses the create-stub-then-ALTER idiom and
   string '+' concatenation instead.
   ========================================================================= */

/* ── Users.Status ───────────────────────────────────────────────────── */
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Status'
)
BEGIN
  ALTER TABLE dbo.Users ADD Status VARCHAR(20) NOT NULL
    CONSTRAINT DF_Users_Status DEFAULT 'active'
    CONSTRAINT CK_Users_Status CHECK (Status IN ('active','inactive','blocked'));
END
GO

/* ── Payments extra columns ─────────────────────────────────────────── */
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'PaymentMethod')
  ALTER TABLE dbo.Payments ADD PaymentMethod NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'Receipt')
  ALTER TABLE dbo.Payments ADD Receipt NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'UpdatedAt')
  ALTER TABLE dbo.Payments ADD UpdatedAt DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Payments') AND name = 'FailureReason')
  ALTER TABLE dbo.Payments ADD FailureReason NVARCHAR(500) NULL;
GO
-- widen Status check to include partially_refunded (drop+recreate the constraint if present)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Payment_Status')
  ALTER TABLE dbo.Payments DROP CONSTRAINT CK_Payment_Status;
GO
ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payment_Status
  CHECK (Status IN ('created','pending','success','failed','refunded','partially_refunded'));
GO

/* ── AuditLogs (admin actions — separate from user AnalyticsEvents/Activity) ── */
IF OBJECT_ID('dbo.AuditLogs') IS NULL
BEGIN
  CREATE TABLE dbo.AuditLogs (
    AuditLogId  INT IDENTITY(1,1) PRIMARY KEY,
    AdminId     INT NOT NULL CONSTRAINT FK_Audit_Admin REFERENCES dbo.Users(UserId),
    Action      VARCHAR(50)     NOT NULL,   -- USER_BLOCKED, MODULE_UPDATED, REFUND_PROCESSED, etc.
    TargetType  VARCHAR(30)     NOT NULL,   -- 'user' | 'module' | 'payment' | 'feedback'
    TargetId    INT             NULL,
    Description NVARCHAR(500)   NULL,
    IPAddress   VARCHAR(64)     NULL,
    CreatedAt   DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_AuditLogs_CreatedAt ON dbo.AuditLogs(CreatedAt DESC);
END
GO

/* ── WebhookEvents (Razorpay webhook idempotency) ───────────────────── */
IF OBJECT_ID('dbo.WebhookEvents') IS NULL
BEGIN
  CREATE TABLE dbo.WebhookEvents (
    EventPk          INT IDENTITY(1,1) PRIMARY KEY,
    RazorpayEventId  NVARCHAR(150)  NOT NULL,
    EventType        VARCHAR(50)    NOT NULL,
    Payload          NVARCHAR(MAX)  NULL,
    ProcessedAt      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_WebhookEvents_EventId UNIQUE (RazorpayEventId)
  );
END
GO

/* =========================================================================
   STORED PROCEDURES
   Every paged proc returns the page rows as its result set and the total
   row count via the @TotalRecords OUTPUT parameter (one round trip).
   Each is created via a stub-if-missing + ALTER, since this SQL Server
   version predates CREATE OR ALTER PROCEDURE.
   ========================================================================= */

IF OBJECT_ID('dbo.sp_GetUsersPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetUsersPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetUsersPaged
  @Page INT, @PageSize INT,
  @Search NVARCHAR(255) = NULL,
  @Role VARCHAR(20) = NULL,
  @Status VARCHAR(20) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH Filtered AS (
    SELECT UserId, FullName, Email, Role, Status, IsPremium, CreatedAt, LastLoginAt
    FROM dbo.Users
    WHERE (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
      AND (@Role IS NULL OR Role = @Role)
      AND (@Status IS NULL OR Status = @Status)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT UserId, FullName, Email, Role, Status, IsPremium, CreatedAt, LastLoginAt,
           ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM dbo.Users
    WHERE (@Search IS NULL OR FullName LIKE @Pattern OR Email LIKE @Pattern)
      AND (@Role IS NULL OR Role = @Role)
      AND (@Status IS NULL OR Status = @Status)
  )
  SELECT UserId, FullName, Email, Role, Status, IsPremium, CreatedAt, LastLoginAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_GetModulesPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetModulesPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetModulesPaged
  @Page INT, @PageSize INT,
  @Category VARCHAR(30) = NULL,
  @Search NVARCHAR(255) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH Filtered AS (
    SELECT ModuleId FROM dbo.Modules
    WHERE (@Category IS NULL OR Category = @Category)
      AND (@Search IS NULL OR Name LIKE @Pattern OR Slug LIKE @Pattern)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT m.ModuleId, m.Name, m.Slug, m.Category, m.Description,
           m.IsPremium, m.RequiredPlan, m.SortOrder, m.IsActive, m.CreatedAt,
           (SELECT COUNT(*) FROM dbo.Problems p WHERE p.ModuleId = m.ModuleId) AS ProblemCount,
           (SELECT COUNT(DISTINCT et.UserId) FROM dbo.ExecutionTraces et WHERE et.ModuleId = m.ModuleId) AS ActiveUsers,
           ROW_NUMBER() OVER (ORDER BY m.SortOrder, m.Name) AS RowNum
    FROM dbo.Modules m
    WHERE (@Category IS NULL OR m.Category = @Category)
      AND (@Search IS NULL OR m.Name LIKE @Pattern OR m.Slug LIKE @Pattern)
  )
  SELECT ModuleId, Name, Slug, Category, Description, IsPremium, RequiredPlan,
         SortOrder, IsActive, CreatedAt, ProblemCount, ActiveUsers
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_GetPaymentsPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetPaymentsPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetPaymentsPaged
  @Page INT, @PageSize INT,
  @Status VARCHAR(20) = NULL,
  @UserId INT = NULL,
  @Search NVARCHAR(255) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH Filtered AS (
    SELECT p.PaymentId
    FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
    WHERE (@Status IS NULL OR p.Status = @Status)
      AND (@UserId IS NULL OR p.UserId = @UserId)
      AND (@Search IS NULL OR u.FullName LIKE @Pattern OR u.Email LIKE @Pattern OR p.ProviderPaymentId LIKE @Pattern)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT p.PaymentId, p.UserId, u.FullName, u.Email,
           p.Provider, p.ProviderOrderId, p.ProviderPaymentId,
           p.Amount, p.Currency, p.PlanName, p.Status,
           p.PaymentMethod, p.Receipt, p.FailureReason,
           p.CreatedAt, p.UpdatedAt,
           ROW_NUMBER() OVER (ORDER BY p.CreatedAt DESC) AS RowNum
    FROM dbo.Payments p JOIN dbo.Users u ON u.UserId = p.UserId
    WHERE (@Status IS NULL OR p.Status = @Status)
      AND (@UserId IS NULL OR p.UserId = @UserId)
      AND (@Search IS NULL OR u.FullName LIKE @Pattern OR u.Email LIKE @Pattern OR p.ProviderPaymentId LIKE @Pattern)
  )
  SELECT PaymentId, UserId, FullName, Email, Provider, ProviderOrderId, ProviderPaymentId,
         Amount, Currency, PlanName, Status, PaymentMethod, Receipt, FailureReason, CreatedAt, UpdatedAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_GetFeedbackPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetFeedbackPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetFeedbackPaged
  @Page INT, @PageSize INT,
  @Status VARCHAR(20) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;

  ;WITH Filtered AS (
    SELECT FeedbackId FROM dbo.Feedback
    WHERE (@Status IS NULL OR Status = @Status)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT f.FeedbackId, f.UserId, u.FullName, u.Email,
           f.Subject, f.Message, f.Status, f.CreatedAt,
           f.AdminReply, f.RespondedAt, f.UserSeen,
           ROW_NUMBER() OVER (ORDER BY f.CreatedAt DESC) AS RowNum
    FROM dbo.Feedback f
    LEFT JOIN dbo.Users u ON u.UserId = f.UserId
    WHERE (@Status IS NULL OR f.Status = @Status)
  )
  SELECT FeedbackId, UserId, FullName, Email, Subject, Message, Status, CreatedAt,
         AdminReply, RespondedAt, UserSeen
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

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
    SELECT et.TraceId, et.UserId, u.FullName, u.Email,
           'code_run', et.Language + ' · ' + et.Status, et.CreatedAt
    FROM dbo.ExecutionTraces et JOIN dbo.Users u ON u.UserId = et.UserId
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
    SELECT et.TraceId, et.UserId, u.FullName, u.Email,
           'code_run', et.Language + ' · ' + et.Status, et.CreatedAt
    FROM dbo.ExecutionTraces et JOIN dbo.Users u ON u.UserId = et.UserId
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

IF OBJECT_ID('dbo.sp_GetAuditLogsPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetAuditLogsPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetAuditLogsPaged
  @Page INT, @PageSize INT,
  @Search NVARCHAR(255) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;
  DECLARE @Pattern NVARCHAR(257) = '%' + ISNULL(@Search,'') + '%';

  ;WITH Filtered AS (
    SELECT a.AuditLogId
    FROM dbo.AuditLogs a JOIN dbo.Users u ON u.UserId = a.AdminId
    WHERE (@Search IS NULL OR u.FullName LIKE @Pattern OR a.Action LIKE @Pattern OR a.Description LIKE @Pattern)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT a.AuditLogId, a.AdminId, u.FullName AS AdminName, u.Email AS AdminEmail,
           a.Action, a.TargetType, a.TargetId, a.Description, a.IPAddress, a.CreatedAt,
           ROW_NUMBER() OVER (ORDER BY a.CreatedAt DESC) AS RowNum
    FROM dbo.AuditLogs a JOIN dbo.Users u ON u.UserId = a.AdminId
    WHERE (@Search IS NULL OR u.FullName LIKE @Pattern OR a.Action LIKE @Pattern OR a.Description LIKE @Pattern)
  )
  SELECT AuditLogId, AdminId, AdminName, AdminEmail, Action, TargetType, TargetId, Description, IPAddress, CreatedAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_GetSubmissionsPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetSubmissionsPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetSubmissionsPaged
  @Page INT, @PageSize INT,
  @UserId INT = NULL,
  @Status VARCHAR(20) = NULL,
  @TotalRecords INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @StartRow INT = ((@Page - 1) * @PageSize) + 1;
  DECLARE @EndRow   INT = @Page * @PageSize;

  ;WITH Filtered AS (
    SELECT TraceId FROM dbo.ExecutionTraces
    WHERE (@UserId IS NULL OR UserId = @UserId)
      AND (@Status IS NULL OR Status = @Status)
  )
  SELECT @TotalRecords = COUNT(*) FROM Filtered;

  ;WITH Filtered AS (
    SELECT et.TraceId, et.UserId, u.FullName, u.Email, et.ModuleId, m.Name AS ModuleName,
           et.Language, et.Status, et.ErrorMessage, et.CreatedAt,
           ROW_NUMBER() OVER (ORDER BY et.CreatedAt DESC) AS RowNum
    FROM dbo.ExecutionTraces et
    JOIN dbo.Users u ON u.UserId = et.UserId
    LEFT JOIN dbo.Modules m ON m.ModuleId = et.ModuleId
    WHERE (@UserId IS NULL OR et.UserId = @UserId)
      AND (@Status IS NULL OR et.Status = @Status)
  )
  SELECT TraceId, UserId, FullName, Email, ModuleId, ModuleName, Language, Status, ErrorMessage, CreatedAt
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

IF OBJECT_ID('dbo.sp_UpdateUserStatus') IS NULL EXEC('CREATE PROCEDURE dbo.sp_UpdateUserStatus AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_UpdateUserStatus
  @UserId INT, @Status VARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE dbo.Users SET Status = @Status, UpdatedAt = SYSUTCDATETIME() WHERE UserId = @UserId;
END
GO

IF OBJECT_ID('dbo.sp_InsertAuditLog') IS NULL EXEC('CREATE PROCEDURE dbo.sp_InsertAuditLog AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_InsertAuditLog
  @AdminId INT, @Action VARCHAR(50), @TargetType VARCHAR(30),
  @TargetId INT = NULL, @Description NVARCHAR(500) = NULL, @IPAddress VARCHAR(64) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO dbo.AuditLogs (AdminId, Action, TargetType, TargetId, Description, IPAddress)
  VALUES (@AdminId, @Action, @TargetType, @TargetId, @Description, @IPAddress);
END
GO
