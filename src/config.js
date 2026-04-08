require('dotenv').config();

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function splitCsv(value, fallback) {
  const source = value || fallback;
  return source.split(',').map(item => item.trim()).filter(Boolean);
}

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,

  X_AUTH_TOKEN: process.env.X_AUTH_TOKEN,
  X_CT0: process.env.X_CT0,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  TWITTER_MAX_RESULTS: parseInteger(process.env.TWITTER_MAX_RESULTS, 20),
  HOURS_LOOKBACK: parseInteger(process.env.HOURS_LOOKBACK, 3),
  MAX_POSTS_PER_RUN: parseInteger(process.env.MAX_POSTS_PER_RUN, 10),
  MIN_IMPORTANCE: parseInteger(process.env.MIN_IMPORTANCE, 6),
  REQUEST_TIMEOUT_MS: parseInteger(process.env.REQUEST_TIMEOUT_MS, 30000),

  FILTER_PROMPT: process.env.FILTER_PROMPT || 'Select the most important and impactful AI/tech news. Focus on: new model releases, major company announcements, breakthroughs, and significant industry changes.',
  PRIORITY_ACCOUNTS: splitCsv(process.env.PRIORITY_ACCOUNTS, ''),
  BLOCKED_ACCOUNTS: splitCsv(process.env.BLOCKED_ACCOUNTS, ''),

  SCHEDULE_CRON: process.env.SCHEDULE_CRON || '0 */3 * * *',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  DRY_RUN: parseBoolean(process.env.DRY_RUN, false),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  STATE_FILE: process.env.STATE_FILE,
};

function validateConfig() {
  const missing = [];

  if (!config.X_AUTH_TOKEN) missing.push('X_AUTH_TOKEN');
  if (!config.X_CT0) missing.push('X_CT0');
  if (!config.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');

  if (!config.DRY_RUN) {
    if (!config.DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
    if (!config.DISCORD_CHANNEL_ID) missing.push('DISCORD_CHANNEL_ID');
  }

  if (config.TWITTER_MAX_RESULTS <= 0) {
    throw new Error('TWITTER_MAX_RESULTS must be greater than 0');
  }

  if (config.HOURS_LOOKBACK <= 0) {
    throw new Error('HOURS_LOOKBACK must be greater than 0');
  }

  if (config.MAX_POSTS_PER_RUN <= 0) {
    throw new Error('MAX_POSTS_PER_RUN must be greater than 0');
  }

  if (config.MIN_IMPORTANCE < 1 || config.MIN_IMPORTANCE > 10) {
    throw new Error('MIN_IMPORTANCE must be between 1 and 10');
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}

module.exports = {
  ...config,
  validateConfig,
};
