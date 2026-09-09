const { sql, getPool } = require('./src/config/db');

async function migrate() {
  try {
    const pool = await getPool();

    // Check if ModuleSlug column exists
    const checkCol = await pool.request().query(`
      SELECT 1 FROM sys.columns 
      WHERE object_id = OBJECT_ID('dbo.SavedSnippets') 
      AND name = 'ModuleSlug'
    `);

    if (!checkCol.recordset.length) {
      await pool.request().query(`
        ALTER TABLE dbo.SavedSnippets 
        ADD ModuleSlug NVARCHAR(100) NULL
      `);
      console.log('✓ Added ModuleSlug column');
    } else {
      console.log('✓ ModuleSlug column already exists');
    }

    // Create index IX_SavedSnippets_User_Module
    const checkIdx1 = await pool.request().query(`
      SELECT 1 FROM sys.indexes 
      WHERE name = 'IX_SavedSnippets_User_Module' 
      AND object_id = OBJECT_ID('dbo.SavedSnippets')
    `);

    if (!checkIdx1.recordset.length) {
      await pool.request().query(`
        CREATE INDEX IX_SavedSnippets_User_Module 
        ON dbo.SavedSnippets(UserId, ModuleSlug, CreatedAt DESC)
      `);
      console.log('✓ Created index IX_SavedSnippets_User_Module');
    } else {
      console.log('✓ Index IX_SavedSnippets_User_Module already exists');
    }

    // Create index IX_SavedSnippets_CreatedAt
    const checkIdx2 = await pool.request().query(`
      SELECT 1 FROM sys.indexes 
      WHERE name = 'IX_SavedSnippets_CreatedAt' 
      AND object_id = OBJECT_ID('dbo.SavedSnippets')
    `);

    if (!checkIdx2.recordset.length) {
      await pool.request().query(`
        CREATE INDEX IX_SavedSnippets_CreatedAt 
        ON dbo.SavedSnippets(CreatedAt DESC)
      `);
      console.log('✓ Created index IX_SavedSnippets_CreatedAt');
    } else {
      console.log('✓ Index IX_SavedSnippets_CreatedAt already exists');
    }

    // Backfill ModuleSlug from ModuleId
    const backfillResult = await pool.request().query(`
      UPDATE ss
      SET ss.ModuleSlug = m.Slug
      FROM dbo.SavedSnippets ss
      INNER JOIN dbo.Modules m ON m.ModuleId = ss.ModuleId
      WHERE ss.ModuleSlug IS NULL AND ss.ModuleId IS NOT NULL
    `);
    console.log(`✓ Backfilled ${backfillResult.rowsAffected[0]} records with ModuleSlug`);

    console.log('\n✅ Code history migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
