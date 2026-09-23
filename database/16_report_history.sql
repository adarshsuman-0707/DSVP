/* =========================================================================
   16_report_history.sql
   Reports feature — records every report a user/admin generates & exports
   (Excel/PDF/CSV) so both "My Reports" and Admin → Reports can show a
   history list of past generations. Idempotent — safe to re-run.
   Target: SQL Server 2008 (matches existing migrations in this folder) —
   no CREATE OR ALTER, uses the create-stub-then-ALTER idiom where a proc
   is needed.
   ========================================================================= */

IF OBJECT_ID('dbo.ReportHistory') IS NULL
BEGIN
  CREATE TABLE dbo.ReportHistory (
    ReportId      INT IDENTITY(1,1) PRIMARY KEY,
    UserId        INT NOT NULL CONSTRAINT FK_ReportHistory_User REFERENCES dbo.Users(UserId),
    IsAdminReport BIT NOT NULL CONSTRAINT DF_ReportHistory_IsAdmin DEFAULT 0,
    ReportType    VARCHAR(50) NOT NULL,
    ReportName    VARCHAR(200) NOT NULL,
    Format        VARCHAR(10) NOT NULL,          -- 'excel' | 'pdf' | 'csv'
    RecordCount   INT NOT NULL CONSTRAINT DF_ReportHistory_RecordCount DEFAULT 0,
    FiltersJson   NVARCHAR(MAX) NULL,
    CreatedAt     DATETIME2 NOT NULL CONSTRAINT DF_ReportHistory_CreatedAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ReportHistory_User_Created ON dbo.ReportHistory(UserId, CreatedAt DESC);
  CREATE INDEX IX_ReportHistory_Admin_Created ON dbo.ReportHistory(IsAdminReport, CreatedAt DESC);
END
GO
