-- Add subscription fields to Users table

-- Add SubscriptionPlan
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'SubscriptionPlan')
BEGIN
    ALTER TABLE dbo.Users ADD SubscriptionPlan NVARCHAR(20) NULL;
    PRINT 'Added SubscriptionPlan column';
END

-- Add SubscriptionExpiry
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'SubscriptionExpiry')
BEGIN
    ALTER TABLE dbo.Users ADD SubscriptionExpiry DATETIME NULL;
    PRINT 'Added SubscriptionExpiry column';
END

-- Add PremiumModulesAccess
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'PremiumModulesAccess')
BEGIN
    ALTER TABLE dbo.Users ADD PremiumModulesAccess NVARCHAR(MAX) NULL;
    PRINT 'Added PremiumModulesAccess column';
END

GO

-- Update existing users to have default values
UPDATE dbo.Users
SET SubscriptionPlan = ISNULL(SubscriptionPlan, 'free');

GO

-- Add RequiredPlan to Modules table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Modules') AND name = 'RequiredPlan')
BEGIN
    ALTER TABLE dbo.Modules ADD RequiredPlan NVARCHAR(20) NULL;
    PRINT 'Added RequiredPlan column to Modules';
END

GO

-- Set default plan for existing modules
UPDATE dbo.Modules
SET RequiredPlan = ISNULL(RequiredPlan, 'free');

GO

PRINT 'Subscription schema updated successfully!';
