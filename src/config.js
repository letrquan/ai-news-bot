require('dotenv').config();

module.exports = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID,

  APIFY_TOKEN: process.env.APIFY_TOKEN,
  APIFY_ACTOR_ID: process.env.APIFY_ACTOR_ID || '61RPP7dywgiy0JPD0',

  X_AUTH_TOKEN: process.env.X_AUTH_TOKEN,
  X_CT0: process.env.X_CT0,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'glm-4.7',

  TWITTER_SEARCH_TERMS: (process.env.TWITTER_SEARCH_TERMS || 'AI,artificial intelligence,LLM,GPT,OpenAI,Claude,Gemini').split(','),
  TWITTER_MAX_RESULTS: parseInt(process.env.TWITTER_MAX_RESULTS) || 20,

  FILTER_PROMPT: process.env.FILTER_PROMPT || 'Select the most important and impactful AI/tech news. Focus on: new model releases, major company announcements, breakthroughs, and significant industry changes.',

  SCHEDULE_CRON: process.env.SCHEDULE_CRON || '0 */3 * * *',
  HOURS_LOOKBACK: parseInt(process.env.HOURS_LOOKBACK) || 3,
};
