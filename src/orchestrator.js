const { collectNewsItems } = require('./modules/sources');
const { filterAndSummarize } = require('./modules/ai-filter');
const { filterSemanticDuplicates } = require('./modules/semantic-dedupe');
const { init: initDiscord, sendNewsUpdate, destroy: destroyDiscord } = require('./modules/discord');
const {
  filterNewItems,
  filterUnpostedItems,
  logItemDecisions,
  markItemsPosted,
  recordRun,
  storeSemanticMemory,
  storeStoryMemory,
} = require('./utils/cache');
const { createLogger } = require('./utils/logger');
const config = require('./config');
const { CronJob } = require('cron');

let isRunning = false;
const logger = createLogger(config.LOG_LEVEL);

function summarizeReasons(items) {
  const counts = {};
  for (const item of items || []) {
    for (const reason of item.reasons || item.quality?.rejectionReasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

async function runPipeline() {
  if (isRunning) {
    logger.warn('[Pipeline] Already running, skipping...');
    return;
  }

  isRunning = true;
  const runTimestamp = new Date().toISOString();
  const runSummary = {
    crawled: 0,
    recent: 0,
    newItems: 0,
    semanticSkipped: 0,
    curated: 0,
    posted: 0,
    rejectionReasons: {},
    dryRunStateFile: config.DRY_RUN ? (config.STATE_FILE || 'bot-state.db') : null,
    status: 'failed',
  };

  logger.info('[Pipeline] Starting run', {
    dryRun: config.DRY_RUN,
    enabledSources: config.ENABLED_SOURCES,
  });

  try {
    logger.info('[Pipeline] Step 1: Collecting source items...');
    const items = await collectNewsItems(logger, runTimestamp);
    runSummary.crawled = items.length;

    if (!items.length) {
      logger.info('[Pipeline] No items found. Skipping.');
      runSummary.status = 'no_items';
      return;
    }

    const cutoff = new Date(Date.now() - config.HOURS_LOOKBACK * 60 * 60 * 1000);
    const recentItems = items.filter(item => new Date(item.createdAt) > cutoff);
    const staleItems = items.filter(item => !(new Date(item.createdAt) > cutoff)).map(item => ({ ...item, reasons: ['stale'] }));
    const newItems = filterNewItems(recentItems, config, logger);
    const seenItems = recentItems
      .filter(item => !newItems.some(newItem => newItem.id === item.id))
      .map(item => ({ ...item, reasons: ['already_seen'] }));

    runSummary.recent = recentItems.length;
    runSummary.newItems = newItems.length;
    logItemDecisions('freshness', staleItems, 'rejected', config, runTimestamp);
    logItemDecisions('seen-filter', seenItems, 'rejected', config, runTimestamp);

    if (!newItems.length) {
      logger.info('[Pipeline] No new items. Skipping.');
      runSummary.status = 'no_new_items';
      runSummary.rejectionReasons = summarizeReasons([...staleItems, ...seenItems]);
      return;
    }

    logger.info('[Pipeline] Step 1b: Semantic deduplication...');
    const semanticResult = await filterSemanticDuplicates(newItems, logger);
    runSummary.semanticSkipped = semanticResult.skipped;
    logItemDecisions('semantic-dedupe', semanticResult.duplicates || [], 'rejected', config, runTimestamp);

    if (!semanticResult.items.length) {
      logger.info('[Pipeline] All new items were semantically duplicated. Skipping.');
      runSummary.status = 'all_semantic_duplicates';
      runSummary.rejectionReasons = summarizeReasons([...(semanticResult.duplicates || [])]);
      return;
    }

    logger.info('[Pipeline] Step 2: AI filtering & summarizing...');
    const curatedResults = await filterAndSummarize(semanticResult.items, logger);
    const curated = filterUnpostedItems(curatedResults, config, logger);
    const filteredCurated = curatedResults
      .filter(item => !curated.some(kept => kept.item.id === item.item.id))
      .map(item => ({ ...item, reasons: ['already_posted_or_not_material'] }));
    logItemDecisions('curation', curated, 'accepted', config, runTimestamp);
    logItemDecisions('post-filter', filteredCurated, 'rejected', config, runTimestamp);
    runSummary.curated = curated.length;

    if (!curated.length) {
      logger.info('[Pipeline] No noteworthy updates found.');
      runSummary.status = 'no_curated_items';
      runSummary.rejectionReasons = summarizeReasons([...(semanticResult.duplicates || []), ...filteredCurated]);
      return;
    }

    logger.info(`[Pipeline] Step 3: Sending up to ${config.MAX_POSTS_PER_RUN} updates to Discord...`);
    const postedItems = await sendNewsUpdate(curated, logger);
    markItemsPosted(postedItems, config);
    storeSemanticMemory(postedItems, config);
    storeStoryMemory(postedItems, config);
    logItemDecisions('delivery', postedItems, 'accepted', config, runTimestamp);

    runSummary.posted = postedItems.length;
    runSummary.rejectionReasons = summarizeReasons([
      ...staleItems,
      ...seenItems,
      ...(semanticResult.duplicates || []),
      ...filteredCurated,
    ]);
    runSummary.status = config.DRY_RUN ? 'dry_run' : 'success';
    logger.info('[Pipeline] Run completed', runSummary);
  } catch (err) {
    logger.error(`[Pipeline] Error: ${err.stack || err.message}`);
  } finally {
    recordRun(runSummary, config);
    isRunning = false;
  }
}

async function start() {
  config.validateConfig();
  logger.info('[Startup] AI News Bot starting', {
    schedule: config.SCHEDULE_CRON,
    timezone: config.TIMEZONE,
    dryRun: config.DRY_RUN,
    runOnce: config.RUN_ONCE,
    enabledSources: config.ENABLED_SOURCES,
  });

  await initDiscord(logger);

  if (config.RUN_ONCE) {
    logger.info('[Startup] RUN_ONCE enabled, executing a single immediate update');
    await runPipeline();
    await destroyDiscord();
    return;
  }

  logger.info(`[Scheduler] Running every: ${config.SCHEDULE_CRON}`);

  const job = new CronJob(
    config.SCHEDULE_CRON,
    runPipeline,
    null,
    true,
    config.TIMEZONE
  );

  logger.info('[Scheduler] Next run', {
    nextRun: job.nextDate().toJSDate().toLocaleString('vi-VN', { timeZone: config.TIMEZONE }),
  });
  logger.info('[Startup] Bot is running. Press Ctrl+C to stop.');

  await runPipeline();

  process.on('SIGINT', async () => {
    logger.info('[Shutdown] Stopping bot...');
    job.stop();
    await destroyDiscord();
    process.exit(0);
  });
}

module.exports = { start, runPipeline };
