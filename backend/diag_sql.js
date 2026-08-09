require('dotenv').config();
const { getPool, sql } = require('./src/config/db');

getPool().then(async pool => {
  // Test basic OFFSET FETCH
  console.log('Testing OFFSET FETCH...');
  try {
    const r = await pool.request()
      .input('Offset', sql.Int, 0)
      .input('PageSize', sql.Int, 10)
      .query(`
        SELECT UserId, FullName, Email, Role
        FROM dbo.Users
        ORDER BY CreatedAt DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);
    console.log('✅ OFFSET FETCH works! rows:', r.recordset.length);
  } catch(e) {
    console.log('❌ OFFSET FETCH failed:', e.message);
  }

  // Test without params
  try {
    const r2 = await pool.request().query(`
      SELECT UserId, FullName FROM dbo.Users
      ORDER BY CreatedAt DESC
      OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
    `);
    console.log('✅ Inline OFFSET works! rows:', r2.recordset.length);
  } catch(e) {
    console.log('❌ Inline OFFSET failed:', e.message);
  }

  // Check SQL Server version
  const ver = await pool.request().query('SELECT @@VERSION AS v');
  console.log('SQL version snippet:', ver.recordset[0].v.substring(0, 80));

  // Check compatibility level
  const compat = await pool.request().query(
    "SELECT compatibility_level FROM sys.databases WHERE name = 'DSVP_DB'"
  );
  console.log('DB compatibility level:', compat.recordset[0]?.compatibility_level);

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
