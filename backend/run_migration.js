require('dotenv').config();
const fs = require('fs');
const { getPool } = require('./src/config/db');

async function main() {
  const file = process.argv[2];
  const text = fs.readFileSync(file, 'utf8');
  const batches = text.split(/^\s*GO\s*$/mi).map(b => b.trim()).filter(Boolean);
  const pool = await getPool();
  for (const batch of batches) {
    try {
      await pool.request().query(batch);
      console.log('OK batch (' + batch.slice(0, 60).replace(/\n/g, ' ') + '...)');
    } catch (err) {
      console.error('FAIL batch:', batch.slice(0, 150).replace(/\n/g, ' '));
      console.error(err.message);
      process.exitCode = 1;
    }
  }
  process.exit(process.exitCode || 0);
}
main().catch(e => { console.error(e); process.exit(1); });
