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
  const source = value == null || value === '' ? fallback : value;
  return source.split(',').map(item => item.trim()).filter(Boolean);
}

const config = {
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
  DISCORD_WEBHOOK_USERNAME: process.env.DISCORD_WEBHOOK_USERNAME,
  DISCORD_WEBHOOK_AVATAR_URL: process.env.DISCORD_WEBHOOK_AVATAR_URL,

  X_AUTH_TOKEN: process.env.X_AUTH_TOKEN,
  X_CT0: process.env.X_CT0,

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'glm-5.1',
  OPENAI_EMBEDDING_API_KEY: process.env.OPENAI_EMBEDDING_API_KEY,
  OPENAI_EMBEDDING_BASE_URL: process.env.OPENAI_EMBEDDING_BASE_URL,
  OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
  AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
  AI_MAX_INPUT_ITEMS: parseInteger(process.env.AI_MAX_INPUT_ITEMS, 16),
  SEMANTIC_DEDUPE_ENABLED: parseBoolean(process.env.SEMANTIC_DEDUPE_ENABLED, true),
  SEMANTIC_SIMILARITY_THRESHOLD: Number.parseFloat(process.env.SEMANTIC_SIMILARITY_THRESHOLD || '0.85'),
  SEMANTIC_MEMORY_MAX_AGE_HOURS: parseInteger(process.env.SEMANTIC_MEMORY_MAX_AGE_HOURS, 168),
  SEMANTIC_EMBEDDING_BATCH_SIZE: parseInteger(process.env.SEMANTIC_EMBEDDING_BATCH_SIZE, 20),
  SEMANTIC_EMBEDDING_MAX_CHARS: parseInteger(process.env.SEMANTIC_EMBEDDING_MAX_CHARS, 2000),
  STORY_MEMORY_MAX_AGE_HOURS: parseInteger(process.env.STORY_MEMORY_MAX_AGE_HOURS, 168),
  STORY_UPDATE_MINUTES: parseInteger(process.env.STORY_UPDATE_MINUTES, 45),
  SOURCE_HEALTH_HISTORY_LIMIT: parseInteger(process.env.SOURCE_HEALTH_HISTORY_LIMIT, 200),

  ENABLED_SOURCES: splitCsv(process.env.ENABLED_SOURCES, 'x,hackernews,reddit,rss'),
  X_MAX_RESULTS: parseInteger(process.env.X_MAX_RESULTS || process.env.TWITTER_MAX_RESULTS, 20),
  HACKERNEWS_KEYWORDS: splitCsv(process.env.HACKERNEWS_KEYWORDS, 'AI,LLM,foundation model,generative AI,multimodal,vision model,speech model,reasoning,agent,agents,agentic,benchmark,evaluation,evals,research paper,paper,open source,GitHub,repo,framework,tooling,SDK,inference,serving,runtime,quantization,RAG,embeddings,vector search,training,finetuning,robotics,embodied AI,world model,coding assistant,automation'),
  HACKERNEWS_MAX_RESULTS: parseInteger(process.env.HACKERNEWS_MAX_RESULTS, 12),
  REDDIT_SUBREDDITS: splitCsv(process.env.REDDIT_SUBREDDITS, 'MachineLearning,LocalLLaMA,OpenSourceAI,singularity,artificial,compsci'),
  REDDIT_SEARCH_QUERY: process.env.REDDIT_SEARCH_QUERY || '("AI" OR "LLM" OR "foundation model" OR "generative AI" OR "multimodal" OR "research paper" OR paper OR benchmark OR evaluation OR evals OR "open source" OR GitHub OR repo OR framework OR toolkit OR agent OR agents OR inference OR serving OR quantization OR RAG OR embeddings OR robotics OR "coding assistant" OR "local AI")',
  REDDIT_MAX_RESULTS: parseInteger(process.env.REDDIT_MAX_RESULTS, 10),
  RSS_FEEDS: splitCsv(process.env.RSS_FEEDS, 'https://openai.com/news/rss.xml,https://huggingface.co/blog/feed.xml,https://www.anthropic.com/news/rss.xml,https://deepmind.google/blog/rss.xml,https://blog.google/technology/ai/rss/,https://www.microsoft.com/en-us/research/feed/,https://ai.meta.com/blog/rss/,https://mistral.ai/news/rss.xml,https://stability.ai/news/rss,https://cohere.com/blog/rss.xml,https://www.ollama.com/blog/rss.xml,https://vllm.ai/feed.xml,https://www.anyscale.com/blog/rss.xml,https://www.together.ai/blog/rss.xml,https://replicate.com/blog/rss.xml,https://www.perplexity.ai/hub/blog/rss.xml,https://www.latent.space/feed,https://lilianweng.github.io/index.xml,https://openrouter.ai/blog/rss.xml,https://www.answer.ai/posts/index.xml'),
  RSS_MAX_RESULTS_PER_FEED: parseInteger(process.env.RSS_MAX_RESULTS_PER_FEED, 25),

  HOURS_LOOKBACK: parseInteger(process.env.HOURS_LOOKBACK, 6),
  MAX_POSTS_PER_RUN: parseInteger(process.env.MAX_POSTS_PER_RUN, 10),
  MIN_IMPORTANCE: parseInteger(process.env.MIN_IMPORTANCE, 6),
  REQUEST_TIMEOUT_MS: parseInteger(process.env.REQUEST_TIMEOUT_MS, 30000),

  FILTER_PROMPT: process.env.FILTER_PROMPT || 'Select the highest-signal AI ecosystem news. Include major model releases, important research breakthroughs, useful AI tools, open-source releases, infrastructure and inference improvements, benchmarks and evaluation advances, multimodal and robotics progress, applied AI systems with technical substance, and regulation or policy changes with real AI impact. Prefer original, evidence-backed sources such as papers, repositories, release notes, demos, benchmarks, engineering writeups, and official announcements. Deprioritize hype, reaction-only commentary, vague teasers, generic listicles, thin wrappers, and unverified claims.',
  PRIORITY_ACCOUNTS: splitCsv(process.env.PRIORITY_ACCOUNTS, ''),
  BLOCKED_ACCOUNTS: splitCsv(process.env.BLOCKED_ACCOUNTS, ''),

  SCHEDULE_CRON: process.env.SCHEDULE_CRON || '0 */3 * * *',
  TIMEZONE: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  DRY_RUN: parseBoolean(process.env.DRY_RUN, false),
  RUN_ONCE: parseBoolean(process.env.RUN_ONCE, false),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  STATE_FILE: process.env.STATE_FILE,
  HTTP_USER_AGENT: process.env.HTTP_USER_AGENT || 'ai-news-bot/1.0 (+https://github.com/)',
};

function validateConfig() {
  const missing = [];
  const enabledSources = new Set(config.ENABLED_SOURCES);

  if (!config.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');

  if (enabledSources.has('x')) {
    if (!config.X_AUTH_TOKEN) missing.push('X_AUTH_TOKEN');
    if (!config.X_CT0) missing.push('X_CT0');
  }

  if (!config.DRY_RUN) {
    if (!config.DISCORD_WEBHOOK_URL) missing.push('DISCORD_WEBHOOK_URL');
  }

  if (!config.ENABLED_SOURCES.length) {
    throw new Error('ENABLED_SOURCES must contain at least one source');
  }

  if (config.X_MAX_RESULTS <= 0) {
    throw new Error('X_MAX_RESULTS must be greater than 0');
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

  if (config.AI_MAX_INPUT_ITEMS <= 0) {
    throw new Error('AI_MAX_INPUT_ITEMS must be greater than 0');
  }

  if (Number.isNaN(config.SEMANTIC_SIMILARITY_THRESHOLD) || config.SEMANTIC_SIMILARITY_THRESHOLD <= 0 || config.SEMANTIC_SIMILARITY_THRESHOLD > 1) {
    throw new Error('SEMANTIC_SIMILARITY_THRESHOLD must be between 0 and 1');
  }

  if (config.SEMANTIC_MEMORY_MAX_AGE_HOURS <= 0) {
    throw new Error('SEMANTIC_MEMORY_MAX_AGE_HOURS must be greater than 0');
  }

  if (config.STORY_MEMORY_MAX_AGE_HOURS <= 0) {
    throw new Error('STORY_MEMORY_MAX_AGE_HOURS must be greater than 0');
  }

  if (config.STORY_UPDATE_MINUTES <= 0) {
    throw new Error('STORY_UPDATE_MINUTES must be greater than 0');
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
