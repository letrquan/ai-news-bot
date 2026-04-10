const config = require('../config');
const { cleanText, sanitizeUrl, truncate } = require('./sources/common');

const DISCORD_MAX_CONTENT = 1800;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

async function init(logger = console) {
  if (config.DRY_RUN) {
    logger.info('[Discord] DRY_RUN enabled, skipping webhook validation');
    return;
  }

  logger.info('[Discord] Webhook delivery enabled');
}

function sanitizeDiscordText(value, maxLength = DISCORD_MAX_CONTENT) {
  const sanitized = cleanText(value)
    .replace(/@everyone/g, '@\u200beveryone')
    .replace(/@here/g, '@\u200bhere')
    .replace(/<@&?\d+>/g, '[mention removed]')
    .replace(/<#\d+>/g, '[channel removed]')
    .replace(/<a?:\w+:\d+>/g, '[emoji removed]');

  return truncate(sanitized, maxLength);
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
    allowed_mentions: { parse: [] },
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
    const error = new Error(`Webhook post failed: ${response.status} ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
}

async function postWebhookWithRetry(payload, logger = console, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await postWebhook(payload);
      return;
    } catch (err) {
      lastError = err;
      if (!RETRYABLE_STATUS_CODES.has(err.status) || attempt === attempts) {
        break;
      }

      logger.warn(`[Discord] Webhook attempt ${attempt} failed, retrying: ${err.message}`);
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}

function buildHeaderContent(itemsToPost, timestamp) {
  return sanitizeDiscordText(
    `AI NEWS UPDATE — ${timestamp}\nFound ${itemsToPost.length} important updates across ${config.ENABLED_SOURCES.join(', ')}`,
    500,
  );
}

function buildItemMessage(result, index) {
  const source = sanitizeDiscordText(result.item.sourceLabel, 80);
  const category = sanitizeDiscordText(result.category, 40);
  const title = sanitizeDiscordText(result.title, 180);
  const summary = sanitizeDiscordText(result.summary, 500);
  const url = sanitizeUrl(result.item.url || '', '');

  if (!url) {
    return null;
  }

  return sanitizeDiscordText(
    `[${index + 1}] ${title}\nCategory: ${category} | Importance: ${result.importance}/10 | Source: ${source}\n${summary}\n${url}`,
    DISCORD_MAX_CONTENT,
  );
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

  await postWebhookWithRetry({
    content: buildHeaderContent(itemsToPost, timestamp),
  }, logger);

  for (const [index, result] of itemsToPost.entries()) {
    const content = buildItemMessage(result, index);
    if (!content) {
      logger.warn('[Discord] Skipping item with invalid URL', { title: result.title });
      continue;
    }

    try {
      await postWebhookWithRetry({ content }, logger);
      postedItems.push(result);
      await sleep(800);
    } catch (err) {
      logger.error(`[Discord] Failed to send item: ${err.message}`);
    }
  }

  return postedItems;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function destroy() {}

module.exports = { init, sendNewsUpdate, destroy };
