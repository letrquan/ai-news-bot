const { crawlTweets, crawlTweetsFallback } = require('./modules/crawler');
const { filterAndSummarize } = require('./modules/ai-filter');
const { init: initDiscord, sendNewsUpdate, destroy: destroyDiscord } = require('./modules/discord');
const { filterDuplicate } = require('./utils/cache');
const config = require('./config');
const { CronJob } = require('cron');

let isRunning = false;

async function runPipeline() {
  if (isRunning) {
    console.log('[Pipeline] Already running, skipping...');
    return;
  }

  isRunning = true;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[Pipeline] Starting at ${new Date().toISOString()}`);
  console.log(`${'='.repeat(50)}\n`);

  try {
    console.log('[Pipeline] Step 1: Crawling tweets...');
    let tweets;
    try {
      tweets = await crawlTweets();
    } catch (err) {
      console.error('[Pipeline] Primary crawler failed, trying fallback:', err.message);
      tweets = await crawlTweetsFallback();
    }

    if (!tweets.length) {
      console.log('[Pipeline] No tweets found. Skipping.');
      return;
    }

    const cutoff = new Date(Date.now() - config.HOURS_LOOKBACK * 60 * 60 * 1000);
    const recentTweets = tweets.filter(t => new Date(t.createdAt) > cutoff);
    const newTweets = filterDuplicate(recentTweets);

    if (!newTweets.length) {
      console.log('[Pipeline] No new tweets. Skipping.');
      return;
    }

    console.log('[Pipeline] Step 2: AI filtering & summarizing...');
    const curated = await filterAndSummarize(newTweets);

    if (!curated.length) {
      console.log('[Pipeline] No noteworthy updates found.');
      return;
    }

    console.log(`[Pipeline] Step 3: Sending ${curated.length} updates to Discord...`);
    await sendNewsUpdate(curated);

    console.log('\n[Pipeline] Done! ✅\n');
  } catch (err) {
    console.error('[Pipeline] Error:', err);
  } finally {
    isRunning = false;
  }
}

async function start() {
  console.log('🤖 AI News Bot starting...\n');

  await initDiscord();

  console.log(`[Scheduler] Running every: ${config.SCHEDULE_CRON}`);

  const job = new CronJob(
    config.SCHEDULE_CRON,
    runPipeline,
    null,
    true,
    'Asia/Ho_Chi_Minh'
  );

  console.log('[Scheduler] Next run:', job.nextDate().toJSDate().toLocaleString('vi-VN'));
  console.log('\nBot is running. Press Ctrl+C to stop.\n');

  await runPipeline();

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    job.stop();
    await destroyDiscord();
    process.exit(0);
  });
}

module.exports = { start, runPipeline };
