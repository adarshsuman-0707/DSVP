require('dotenv').config();
const { getPool } = require('./src/config/db');

getPool().then(async pool => {
  // 1. Which tables exist?
  const tables = await pool.request().query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
  );
  console.log('TABLES:', tables.recordset.map(x => x.TABLE_NAME).join(', '));

  // 2. Users columns
  const cols = await pool.request().query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Users' ORDER BY ORDINAL_POSITION"
  );
  console.log('Users cols:', cols.recordset.map(x => x.COLUMN_NAME).join(', '));

  // 3. Row counts
  const [u, m, t, p, f] = await Promise.all([
    pool.request().query('SELECT COUNT(*) n FROM dbo.Users'),
    pool.request().query('SELECT COUNT(*) n FROM dbo.Modules'),
    pool.request().query('SELECT COUNT(*) n FROM dbo.ExecutionTraces'),
    pool.request().query('SELECT COUNT(*) n FROM dbo.Payments'),
    pool.request().query('SELECT COUNT(*) n FROM dbo.Feedback'),
  ]);
  console.log(`Counts — Users:${u.recordset[0].n} Modules:${m.recordset[0].n} Traces:${t.recordset[0].n} Payments:${p.recordset[0].n} Feedback:${f.recordset[0].n}`);

  // 4. Sample users with Role
  const users = await pool.request().query('SELECT TOP 3 UserId, FullName, Email, Role, IsPremium FROM dbo.Users');
  console.log('Sample users:', JSON.stringify(users.recordset, null, 2));

  // 5. Sample modules
  const mods = await pool.request().query('SELECT TOP 5 ModuleId, Name, Slug, IsActive, IsPremium FROM dbo.Modules ORDER BY SortOrder');
  console.log('Sample modules:', JSON.stringify(mods.recordset, null, 2));

  // 6. Test the dashboard query
  const dash = await pool.request().query(`
    SELECT TOP 5 UserId, FullName, Email, Role, IsPremium, CreatedAt
    FROM dbo.Users ORDER BY CreatedAt DESC
  `);
  console.log('Dashboard users:', JSON.stringify(dash.recordset, null, 2));

  process.exit(0);
}).catch(e => {
  console.error('DB ERROR:', e.message);
  process.exit(1);
});
