const { sql, getPool } = require('../config/db');

const ModuleModel = {
  async listModules({ filter = 'all' } = {}) {
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE IsActive = 1';
    if (filter === 'free') where += ' AND IsPremium = 0';
    if (filter === 'premium') where += ' AND IsPremium = 1';

    const result = await request.query(`
      SELECT ModuleId, Name, Slug, Category, Description, IsPremium, IconUrl, SortOrder, RequiredPlan
      FROM dbo.Modules
      ${where}
      ORDER BY SortOrder ASC
    `);
    return result.recordset;
  },

  async getBySlug(slug) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('Slug', sql.NVarChar(100), slug)
      .query('SELECT * FROM dbo.Modules WHERE Slug = @Slug AND IsActive = 1');
    return result.recordset[0];
  },
};

module.exports = ModuleModel;
