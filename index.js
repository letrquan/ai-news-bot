require('dotenv').config();
const { start } = require('./src/orchestrator');

start().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
