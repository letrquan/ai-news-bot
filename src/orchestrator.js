const { crawlTweets, crawlTweetsFallback } = require('./modules/crawler');
const { filterAndSummarize } = require('./modules/ai-filter');
const { init: initDiscord, sendNewsUpdate, destroy: destroyDiscord } = require('./modules/discord');
const { filterNewTweets, filterUnpostedItems, markItemsPosted, recordRun } = require('./utils/cache');
const { createLogger } = require('./utils/logger');
const config = require('./config');
const { CronJob } = require('cron');

let isRunning = false;
const logger = createLogger(config.LOG_LEVEL);

async function runPipeline() {
  if (isRunning) {
    logger.warn('[Pipeline] Already running, skipping...');
    return;
  }

  isRunning = true;
  const runSummary = {
    crawled: 0,
    recent: 0,
    newTweets: 0,
    curated: 0,
    posted: 0,
    status: 'failed',
  };

  logger.info('[Pipeline] Starting run', { dryRun: config.DRY_RUN });

  try {
    logger.info('[Pipeline] Step 1: Crawling tweets...');
    let tweets;
    try {
      tweets = await crawlTweets(logger);
    } catch (err) {
      logger.warn(`[Pipeline] Primary crawler failed, trying fallback: ${err.message}`);
      tweets = await crawlTweetsFallback(logger);
    }

    runSummary.crawled = tweets.length;

    if (!tweets.length) {
      logger.info('[Pipeline] No tweets found. Skipping.');
      runSummary.status = 'no_tweets';
      return;
    }

    const cutoff = new Date(Date.now() - config.HOURS_LOOKBACK * 60 * 60 * 1000);
    const recentTweets = tweets.filter(tweet => new Date(tweet.createdAt) > cutoff);
    const newTweets = filterNewTweets(recentTweets, config, logger);

    runSummary.recent = recentTweets.length;
    runSummary.newTweets = newTweets.length;

    if (!newTweets.length) {
      logger.info('[Pipeline] No new tweets. Skipping.');
      runSummary.status = 'no_new_tweets';
      return;
    }

    logger.info('[Pipeline] Step 2: AI filtering & summarizing...');
    const curated = filterUnpostedItems(await filterAndSummarize(newTweets, logger), config, logger);
    runSummary.curated = curated.length;

    if (!curated.length) {
      logger.info('[Pipeline] No noteworthy updates found.');
      runSummary.status = 'no_curated_items';
      return;
    }

    logger.info(`[Pipeline] Step 3: Sending up to ${config.MAX_POSTS_PER_RUN} updates to Discord...`);
    const postedItems = await sendNewsUpdate(curated, logger);
    markItemsPosted(postedItems, config);

    runSummary.posted = postedItems.length;
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
  });

  await initDiscord(logger);

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
