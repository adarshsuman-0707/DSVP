const { sql, getPool } = require('./src/config/db');

/**
 * Adds the columns needed for a two-way feedback loop:
 *   AdminReply   - the admin's written response to the user's feedback
 *   RespondedAt  - when that response was last set
 *   UserSeen     - whether the submitting user has seen the current
 *                  status/reply. Defaults to 1 (seen) so existing rows
 *                  don't suddenly show as "new" notifications for users
 *                  who submitted them long before this feature existed.
 *                  Set back to 0 whenever an admin changes status or
 *                  replies, so the user gets a notification.
 */
async function migrate() {
  try {
    const pool = await getPool();

    async function columnExists(table, column) {
      const r = await pool.request()
        .input('Table', sql.NVarChar(128), table)
        .input('Column', sql.NVarChar(128), column)
        .query(`
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('dbo.' + @Table) AND name = @Column
        `);
      return r.recordset.length > 0;
    }

    if (!(await columnExists('Feedback', 'AdminReply'))) {
      await pool.request().query(`ALTER TABLE dbo.Feedback ADD AdminReply NVARCHAR(MAX) NULL`);
      console.log('✓ Added Feedback.AdminReply');
    } else {
      console.log('✓ Feedback.AdminReply already exists');
    }

    if (!(await columnExists('Feedback', 'RespondedAt'))) {
      await pool.request().query(`ALTER TABLE dbo.Feedback ADD RespondedAt DATETIME2 NULL`);
      console.log('✓ Added Feedback.RespondedAt');
    } else {
      console.log('✓ Feedback.RespondedAt already exists');
    }

    if (!(await columnExists('Feedback', 'UserSeen'))) {
      await pool.request().query(`ALTER TABLE dbo.Feedback ADD UserSeen BIT NOT NULL DEFAULT 1`);
      console.log('✓ Added Feedback.UserSeen');
    } else {
      console.log('✓ Feedback.UserSeen already exists');
    }

    console.log('\n✅ Feedback notifications migration complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
