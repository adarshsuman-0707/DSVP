const app = require('./app');
const { getPool } = require('./config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await getPool(); // fail fast if SQL Server isn't reachable
    app.listen(PORT, () => {
      console.log(`🚀 DSVP backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
