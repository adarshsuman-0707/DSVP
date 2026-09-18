const { sql, getPool } = require('./src/config/db');

/**
 * Registers the new "2D Array" module (matrix visualization) — free tier,
 * slotted right after the 1D Array module. Idempotent: safe to re-run.
 */
async function migrate() {
  try {
    const pool = await getPool();

    const existing = await pool.request()
      .input('Slug', sql.NVarChar(100), '2d-array')
      .query(`SELECT 1 FROM dbo.Modules WHERE Slug = @Slug`);

    if (existing.recordset.length > 0) {
      console.log('✓ 2D Array module already exists');
      process.exit(0);
    }

    await pool.request()
      .input('Name',        sql.NVarChar(100),  '2D Array')
      .input('Slug',        sql.NVarChar(100),  '2d-array')
      .input('Category',    sql.VarChar(30),    'array')
      .input('Description', sql.NVarChar(1000), 'Visualize 2D array / matrix operations: row-major traversal, cell reads and writes, live grid updates.')
      .input('IsPremium',   sql.Bit,            0)
      .input('SortOrder',   sql.Int,            2)
      .query(`
        INSERT INTO dbo.Modules (Name, Slug, Category, Description, IsPremium, SortOrder)
        VALUES (@Name, @Slug, @Category, @Description, @IsPremium, @SortOrder)
      `);

    console.log('✓ Created "2D Array" module (slug: 2d-array)');
    console.log('\n✅ 2D Array module migration complete');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
