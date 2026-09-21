/* =========================================================================
   07_module_access.sql
   Module Access / Plan Management: makes Modules.RequiredPlan the single
   source of truth for FREE/BASIC/PREMIUM gating (Admin config drives it,
   not a separate IsPremium toggle), adds an access-level filter to the
   paged modules proc, and a summary proc for the admin KPI cards.
   Idempotent — safe to re-run. SQL Server 2008 compatible.
   ========================================================================= */

/* ── Ensure RequiredPlan is non-null with a sane default + check constraint ── */
UPDATE dbo.Modules SET RequiredPlan = 'free' WHERE RequiredPlan IS NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Modules_RequiredPlan')
  ALTER TABLE dbo.Modules DROP CONSTRAINT CK_Modules_RequiredPlan;
GO
ALTER TABLE dbo.Modules ADD CONSTRAINT CK_Modules_RequiredPlan
  CHECK (RequiredPlan IN ('free','basic','premium'));
GO

/* ── Keep IsPremium (used by older UI code as a quick "is gated" flag) in
     sync with RequiredPlan so the two never disagree ── */
UPDATE dbo.Modules SET IsPremium = CASE WHEN RequiredPlan = 'free' THEN 0 ELSE 1 END;
GO

/* ── sp_GetModulesPaged: add @AccessLevel filter (RequiredPlan) alongside
     the existing @Category filter ── */
IF OBJECT_ID('dbo.sp_GetModulesPaged') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetModulesPaged AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetModulesPaged
  @Page INT, @PageSize INT,
  @Category VARCHAR(30) = NULL,
  @Search NVARCHAR(255) = NULL,
  @AccessLevel VARCHAR(20) = NULL,
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
      AND (@AccessLevel IS NULL OR RequiredPlan = @AccessLevel)
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
      AND (@AccessLevel IS NULL OR m.RequiredPlan = @AccessLevel)
      AND (@Search IS NULL OR m.Name LIKE @Pattern OR m.Slug LIKE @Pattern)
  )
  SELECT ModuleId, Name, Slug, Category, Description, IsPremium, RequiredPlan,
         SortOrder, IsActive, CreatedAt, ProblemCount, ActiveUsers
  FROM Filtered
  WHERE RowNum BETWEEN @StartRow AND @EndRow
  ORDER BY RowNum;
END
GO

/* ── sp_GetModuleAccessSummary: counts for the admin KPI cards ── */
IF OBJECT_ID('dbo.sp_GetModuleAccessSummary') IS NULL EXEC('CREATE PROCEDURE dbo.sp_GetModuleAccessSummary AS SELECT 1');
GO
ALTER PROCEDURE dbo.sp_GetModuleAccessSummary
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    COUNT(*) AS TotalModules,
    SUM(CASE WHEN RequiredPlan = 'free'    THEN 1 ELSE 0 END) AS FreeModules,
    SUM(CASE WHEN RequiredPlan = 'basic'   THEN 1 ELSE 0 END) AS BasicModules,
    SUM(CASE WHEN RequiredPlan = 'premium' THEN 1 ELSE 0 END) AS PremiumModules,
    SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActiveModules
  FROM dbo.Modules;
END
GO
