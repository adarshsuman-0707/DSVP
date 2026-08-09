/* =========================================================================
   Data Structure Visualization Platform (DSVP)
   SQL Server Database Schema
   Run this file in SQL Server Management Studio (SSMS) as a new query
   against a fresh database (create the DB first, see step below).
   ========================================================================= */

-- STEP 1: Create the database (run this block first, alone)
IF DB_ID('DSVP_DB') IS NULL
BEGIN
    CREATE DATABASE DSVP_DB;
END
GO

USE DSVP_DB;
GO

/* =========================================================================
   1. USERS  (also covers Admin — differentiated by Role)
   ========================================================================= */
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
GO
CREATE TABLE dbo.Users (
    UserId          INT IDENTITY(1,1) PRIMARY KEY,
    FullName        NVARCHAR(150)   NOT NULL,
    Email           NVARCHAR(255)   NOT NULL UNIQUE,
    PasswordHash    NVARCHAR(255)   NOT NULL,          -- bcrypt hash
    Role            VARCHAR(20)     NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
                        CONSTRAINT CK_Users_Role CHECK (Role IN ('user','admin')),
    IsPremium       BIT             NOT NULL DEFAULT 0,
    AvatarUrl       NVARCHAR(500)   NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    LastLoginAt     DATETIME2       NULL
);
GO

/* =========================================================================
   2. MODULES  (data structures / algorithms — free & premium)
   Maps to UI/UX Module Catalog screen (3.2) and Free vs Premium doc (§7)
   ========================================================================= */
IF OBJECT_ID('dbo.Modules', 'U') IS NOT NULL DROP TABLE dbo.Modules;
GO
CREATE TABLE dbo.Modules (
    ModuleId        INT IDENTITY(1,1) PRIMARY KEY,
    Name            NVARCHAR(100)   NOT NULL,          -- e.g. 'Linked List', 'AVL Tree'
    Slug            NVARCHAR(100)   NOT NULL UNIQUE,    -- e.g. 'linked-list'
    Category        VARCHAR(30)     NOT NULL,           -- 'array','tree','graph','sorting', etc.
    Description     NVARCHAR(1000)  NULL,
    IsPremium       BIT             NOT NULL DEFAULT 0,
    IconUrl         NVARCHAR(500)   NULL,
    SortOrder       INT             NOT NULL DEFAULT 0,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   3. PROBLEMS  (practice problems tied to a module)
   ========================================================================= */
IF OBJECT_ID('dbo.Problems', 'U') IS NOT NULL DROP TABLE dbo.Problems;
GO
CREATE TABLE dbo.Problems (
    ProblemId       INT IDENTITY(1,1) PRIMARY KEY,
    ModuleId        INT             NOT NULL
                        CONSTRAINT FK_Problems_Module REFERENCES dbo.Modules(ModuleId),
    Title           NVARCHAR(200)   NOT NULL,
    Description     NVARCHAR(MAX)   NULL,
    Difficulty      VARCHAR(10)     NOT NULL DEFAULT 'easy'
                        CONSTRAINT CK_Problems_Difficulty CHECK (Difficulty IN ('easy','medium','hard')),
    StarterCode     NVARCHAR(MAX)   NULL,               -- JSON: { "python": "...", "cpp": "..." }
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   4. USER_PROGRESS  (per-user, per-module/problem tracking)
   ========================================================================= */
IF OBJECT_ID('dbo.UserProgress', 'U') IS NOT NULL DROP TABLE dbo.UserProgress;
GO
CREATE TABLE dbo.UserProgress (
    ProgressId      INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL
                        CONSTRAINT FK_Progress_User REFERENCES dbo.Users(UserId),
    ModuleId        INT             NOT NULL
                        CONSTRAINT FK_Progress_Module REFERENCES dbo.Modules(ModuleId),
    ProblemId       INT             NULL
                        CONSTRAINT FK_Progress_Problem REFERENCES dbo.Problems(ProblemId),
    Status          VARCHAR(20)     NOT NULL DEFAULT 'not_started'
                        CONSTRAINT CK_Progress_Status CHECK (Status IN ('not_started','in_progress','completed')),
    CompletionPct   INT             NOT NULL DEFAULT 0,
    LastAccessedAt  DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_UserModule UNIQUE (UserId, ModuleId, ProblemId)
);
GO

/* =========================================================================
   5. SAVED_SNIPPETS  (user's saved code)
   ========================================================================= */
IF OBJECT_ID('dbo.SavedSnippets', 'U') IS NOT NULL DROP TABLE dbo.SavedSnippets;
GO
CREATE TABLE dbo.SavedSnippets (
    SnippetId       INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL
                        CONSTRAINT FK_Snippet_User REFERENCES dbo.Users(UserId),
    ModuleId        INT             NULL
                        CONSTRAINT FK_Snippet_Module REFERENCES dbo.Modules(ModuleId),
    Title           NVARCHAR(200)   NOT NULL DEFAULT 'Untitled',
    Language        VARCHAR(20)     NOT NULL,           -- 'c','cpp','java','python','csharp'
    Code            NVARCHAR(MAX)   NOT NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   6. EXECUTION_TRACES  (stores generated trace/visualization events)
   ========================================================================= */
IF OBJECT_ID('dbo.ExecutionTraces', 'U') IS NOT NULL DROP TABLE dbo.ExecutionTraces;
GO
CREATE TABLE dbo.ExecutionTraces (
    TraceId         INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL
                        CONSTRAINT FK_Trace_User REFERENCES dbo.Users(UserId),
    ModuleId        INT             NULL
                        CONSTRAINT FK_Trace_Module REFERENCES dbo.Modules(ModuleId),
    Language        VARCHAR(20)     NOT NULL,
    SourceCode      NVARCHAR(MAX)   NOT NULL,
    TraceEventsJson NVARCHAR(MAX)   NOT NULL,           -- JSON array of visualization events
    Status          VARCHAR(20)     NOT NULL DEFAULT 'success'
                        CONSTRAINT CK_Trace_Status CHECK (Status IN ('success','compile_error','runtime_error')),
    ErrorMessage    NVARCHAR(MAX)   NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   7. PAYMENTS  (Razorpay / Stripe transactions)
   ========================================================================= */
IF OBJECT_ID('dbo.Payments', 'U') IS NOT NULL DROP TABLE dbo.Payments;
GO
CREATE TABLE dbo.Payments (
    PaymentId       INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NOT NULL
                        CONSTRAINT FK_Payment_User REFERENCES dbo.Users(UserId),
    Provider        VARCHAR(20)     NOT NULL,           -- 'razorpay' | 'stripe'
    ProviderOrderId NVARCHAR(150)   NULL,
    ProviderPaymentId NVARCHAR(150) NULL,
    Amount          DECIMAL(10,2)   NOT NULL,
    Currency        VARCHAR(10)     NOT NULL DEFAULT 'INR',
    PlanName        NVARCHAR(100)   NOT NULL,           -- e.g. 'Premium Monthly'
    Status          VARCHAR(20)     NOT NULL DEFAULT 'pending'
                        CONSTRAINT CK_Payment_Status CHECK (Status IN ('pending','success','failed','refunded')),
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   8. FEEDBACK  (Admin -> Feedback management, per UI/UX §6)
   ========================================================================= */
IF OBJECT_ID('dbo.Feedback', 'U') IS NOT NULL DROP TABLE dbo.Feedback;
GO
CREATE TABLE dbo.Feedback (
    FeedbackId      INT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NULL
                        CONSTRAINT FK_Feedback_User REFERENCES dbo.Users(UserId),
    Subject         NVARCHAR(200)   NOT NULL,
    Message         NVARCHAR(MAX)   NOT NULL,
    Status          VARCHAR(20)     NOT NULL DEFAULT 'open'
                        CONSTRAINT CK_Feedback_Status CHECK (Status IN ('open','reviewed','resolved')),
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   9. AUDIT / ADMIN ANALYTICS SUPPORT (login/signup event log)
   Powers Admin Analytics Dashboard KPI cards (UI/UX §3.3)
   ========================================================================= */
IF OBJECT_ID('dbo.AnalyticsEvents', 'U') IS NOT NULL DROP TABLE dbo.AnalyticsEvents;
GO
CREATE TABLE dbo.AnalyticsEvents (
    EventId         BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId          INT             NULL
                        CONSTRAINT FK_Event_User REFERENCES dbo.Users(UserId),
    EventType       VARCHAR(50)     NOT NULL,           -- 'signup','login','run_code','purchase', etc.
    MetaJson        NVARCHAR(MAX)   NULL,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* =========================================================================
   Helpful indexes
   ========================================================================= */
CREATE INDEX IX_Problems_Module        ON dbo.Problems(ModuleId);
CREATE INDEX IX_Progress_User          ON dbo.UserProgress(UserId);
CREATE INDEX IX_Snippets_User          ON dbo.SavedSnippets(UserId);
CREATE INDEX IX_Traces_User            ON dbo.ExecutionTraces(UserId);
CREATE INDEX IX_Payments_User          ON dbo.Payments(UserId);
CREATE INDEX IX_Analytics_Type_Date    ON dbo.AnalyticsEvents(EventType, CreatedAt);
GO

PRINT 'DSVP_DB schema created successfully.';
