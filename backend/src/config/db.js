const sql = require('mssql');
require('dotenv').config();

/**
 * SQL Server (SSMS) connection config.
 * Uses the `mssql` npm package which talks to SQL Server via Tedious driver.
 */

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',                 // true if using Azure SQL
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true', // true for local dev
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise;

/**
 * Returns a shared connection pool. Call this instead of creating
 * a new connection in every controller/model.
 */
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then((pool) => {
        console.log('✅ Connected to SQL Server (DSVP_DB)');
        return pool;
      })
      .catch((err) => {
        console.error('❌ SQL Server connection failed:', err.message);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
