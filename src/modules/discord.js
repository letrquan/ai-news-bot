const config = require('../config');

async function init(logger = console) {
  if (config.DRY_RUN) {
    logger.info('[Discord] DRY_RUN enabled, skipping webhook validation');
    return;
  }

  logger.info('[Discord] Webhook delivery enabled');
}

function formatDryRun(items) {
  return items.map((result, index) => ({
    order: index + 1,
    title: result.title,
    importance: result.importance,
    category: result.category,
    source: result.item.sourceLabel,
    author: result.item.author,
    url: result.item.url,
  }));
}

function buildWebhookBody(payload) {
  return {
    username: config.DISCORD_WEBHOOK_USERNAME || undefined,
    avatar_url: config.DISCORD_WEBHOOK_AVATAR_URL || undefined,
    ...payload,
  };
}

async function postWebhook(payload) {
  const response = await fetch(config.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildWebhookBody(payload)),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webhook post failed: ${response.status} ${text.slice(0, 300)}`);
  }
}

async function sendNewsUpdate(items, logger = console) {
  if (config.DRY_RUN) {
    logger.info('[Discord] DRY_RUN payload ready', {
      count: items.length,
      items: formatDryRun(items),
    });
    return items.slice(0, config.MAX_POSTS_PER_RUN);
  }

  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: config.TIMEZONE });
  const postedItems = [];
  const itemsToPost = items.slice(0, config.MAX_POSTS_PER_RUN);

  await postWebhook({
    content: `🔥 **AI NEWS UPDATE** — ${timestamp} 🔥\nFound ${itemsToPost.length} important updates across ${config.ENABLED_SOURCES.join(', ')}`,
  });

  for (const result of itemsToPost) {
    try {
      await postWebhook({ content: result.item.url });
      postedItems.push(result);
      await sleep(800);
    } catch (err) {
      logger.error(`[Discord] Failed to send item link: ${err.message}`);
    }
  }

  return postedItems;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function destroy() {}

module.exports = { init, sendNewsUpdate, destroy };
