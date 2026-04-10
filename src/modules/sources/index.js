const config = require('../../config');
const { dedupeItems } = require('./common');
const { crawlX } = require('./x');
const { crawlHackerNews } = require('./hackernews');
const { crawlReddit } = require('./reddit');
const { crawlRss } = require('./rss');
const { recordSourceRun } = require('../../utils/cache');

const SOURCES = {
  x: crawlX,
  hackernews: crawlHackerNews,
  reddit: crawlReddit,
  rss: crawlRss,
};

async function collectNewsItems(logger = console, runTimestamp = new Date().toISOString()) {
  const enabledSources = config.ENABLED_SOURCES.filter(source => SOURCES[source]);

  logger.info('[Sources] Collecting news items', { enabledSources });

  const results = await Promise.all(enabledSources.map(async source => {
    try {
      const items = await SOURCES[source](logger);
      recordSourceRun(source, 'success', items.length, null, {
        topSortScore: items[0]?.sortScore || 0,
      }, config, runTimestamp);
      return items;
    } catch (err) {
      recordSourceRun(source, 'failed', 0, err.message, {}, config, runTimestamp);
      logger.warn(`[Sources] ${source} failed: ${err.message}`);
      return [];
    }
  }));

  return dedupeItems(results.flat())
    .sort((a, b) => (b.sortScore || 0) - (a.sortScore || 0));
}

module.exports = { collectNewsItems };
