/* =========================================================================
   OTP Table for Forgot Password
   Run this against DSVP_DB
   ========================================================================= */

USE DSVP_DB;
GO

IF OBJECT_ID('dbo.PasswordResetOtp', 'U') IS NOT NULL
    DROP TABLE dbo.PasswordResetOtp;
GO

CREATE TABLE dbo.PasswordResetOtp (
    OtpId       INT IDENTITY(1,1) PRIMARY KEY,
    Email       NVARCHAR(255)  NOT NULL,
    OtpCode     VARCHAR(6)     NOT NULL,          -- 6-digit OTP
    ExpiresAt   DATETIME2      NOT NULL,           -- auto-expire
    Used        BIT            NOT NULL DEFAULT 0, -- 0=unused, 1=used
    CreatedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- Index for fast lookup by email
CREATE INDEX IX_PasswordResetOtp_Email ON dbo.PasswordResetOtp(Email, Used, ExpiresAt);
GO

PRINT 'PasswordResetOtp table created successfully.';
GO
