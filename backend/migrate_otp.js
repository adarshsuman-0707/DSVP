const { sql, getPool } = require('./src/config/db');

async function migrate() {
  try {
    const pool = await getPool();

    // Create PasswordResetOtp table if not exists
    const tableExists = await pool.request().query(`
      SELECT 1 FROM sys.tables WHERE name = 'PasswordResetOtp'
    `);

    if (!tableExists.recordset.length) {
      await pool.request().query(`
        CREATE TABLE dbo.PasswordResetOtp (
          OtpId     INT IDENTITY(1,1) PRIMARY KEY,
          Email     NVARCHAR(255)  NOT NULL,
          OtpCode   VARCHAR(6)     NOT NULL,
          ExpiresAt DATETIME2      NOT NULL,
          Used      BIT            NOT NULL DEFAULT 0,
          CreatedAt DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
        )
      `);
      console.log('✓ Created PasswordResetOtp table');
    } else {
      console.log('✓ PasswordResetOtp table already exists');
    }

    // Index
    const idxExists = await pool.request().query(`
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_PasswordResetOtp_Email'
      AND object_id = OBJECT_ID('dbo.PasswordResetOtp')
    `);
    if (!idxExists.recordset.length) {
      await pool.request().query(`
        CREATE INDEX IX_PasswordResetOtp_Email
        ON dbo.PasswordResetOtp(Email, Used, ExpiresAt)
      `);
      console.log('✓ Created index');
    } else {
      console.log('✓ Index already exists');
    }

    console.log('\n✅ OTP migration complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
