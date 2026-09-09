/* =========================================================================
   Code History Enhancement
   Adds additional fields and indexes for workspace code save/history feature
   ========================================================================= */

USE DSVP_DB;
GO

-- Add ModuleSlug column for easier filtering (denormalized for performance)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SavedSnippets') AND name = 'ModuleSlug')
BEGIN
    ALTER TABLE dbo.SavedSnippets
    ADD ModuleSlug NVARCHAR(100) NULL;
END
GO

-- Add index for faster history retrieval by user and module
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SavedSnippets_User_Module' AND object_id = OBJECT_ID('dbo.SavedSnippets'))
BEGIN
    CREATE INDEX IX_SavedSnippets_User_Module ON dbo.SavedSnippets(UserId, ModuleSlug, CreatedAt DESC);
END
GO

-- Add index for faster sorting by creation date
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SavedSnippets_CreatedAt' AND object_id = OBJECT_ID('dbo.SavedSnippets'))
BEGIN
    CREATE INDEX IX_SavedSnippets_CreatedAt ON dbo.SavedSnippets(CreatedAt DESC);
END
GO

-- Backfill ModuleSlug from existing ModuleId (if any records exist)
UPDATE ss
SET ss.ModuleSlug = m.Slug
FROM dbo.SavedSnippets ss
INNER JOIN dbo.Modules m ON m.ModuleId = ss.ModuleId
WHERE ss.ModuleSlug IS NULL AND ss.ModuleId IS NOT NULL;
GO

PRINT 'Code history schema enhancements applied successfully.';
GO
