const config = require('../../config');
const { dedupeItems } = require('./common');
const { crawlX } = require('./x');
const { crawlHackerNews } = require('./hackernews');
const { crawlReddit } = require('./reddit');
const { crawlRss } = require('./rss');

const SOURCES = {
  x: crawlX,
  hackernews: crawlHackerNews,
  reddit: crawlReddit,
  rss: crawlRss,
};

async function collectNewsItems(logger = console) {
  const enabledSources = config.ENABLED_SOURCES.filter(source => SOURCES[source]);

  logger.info('[Sources] Collecting news items', { enabledSources });

  const results = await Promise.all(enabledSources.map(async source => {
    try {
      return await SOURCES[source](logger);
    } catch (err) {
      logger.warn(`[Sources] ${source} failed: ${err.message}`);
      return [];
    }
  }));

  return dedupeItems(results.flat())
    .sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
}

module.exports = { collectNewsItems };
