require('dotenv').config();
const { start } = require('./src/orchestrator');

start().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
