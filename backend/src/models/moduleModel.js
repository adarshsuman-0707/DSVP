const { sql, getPool } = require('../config/db');

const ModuleModel = {
  // @Filter flag: 'all' | 'free' | 'basic' | 'premium'
  async listModules({ filter = 'all' } = {}) {
    const pool = await getPool();
    const result = await pool.request()
      .input('Filter', sql.VarChar(20), filter)
      .execute('sp_ListModules');
    return result.recordset;
  },

  async getBySlug(slug) {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('Slug', sql.NVarChar(100), slug)
      .execute('sp_GetModuleBySlug');
    return result.recordset[0];
  },
};

module.exports = ModuleModel;
