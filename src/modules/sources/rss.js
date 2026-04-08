const config = require('../../config');
const { fetchText, parseDate, scoreItem, stableId, dedupeItems, stripHtml, truncate } = require('./common');

function matchAll(content, pattern) {
  return [...content.matchAll(pattern)].map(match => match[1]);
}

function pickFirst(block, patterns) {
  for (const pattern of patterns) {
    const match = block.match(pattern);
    if (match?.[1]) {
      return stripHtml(match[1]);
    }
  }

  return '';
}

function parseRssItems(xml, feedUrl) {
  const itemBlocks = matchAll(xml, /<item\b[\s\S]*?>([\s\S]*?)<\/item>/gi);

  return itemBlocks.slice(0, config.RSS_MAX_RESULTS_PER_FEED).map(block => {
    const title = pickFirst(block, [/<title>([\s\S]*?)<\/title>/i]);
    const link = pickFirst(block, [/<link>([\s\S]*?)<\/link>/i, /<guid[^>]*>([\s\S]*?)<\/guid>/i]);
    const description = pickFirst(block, [/<description>([\s\S]*?)<\/description>/i, /<content:encoded>([\s\S]*?)<\/content:encoded>/i]);
    const author = pickFirst(block, [/<dc:creator>([\s\S]*?)<\/dc:creator>/i, /<author>([\s\S]*?)<\/author>/i]) || 'rss';
    const createdAt = pickFirst(block, [/<pubDate>([\s\S]*?)<\/pubDate>/i, /<dc:date>([\s\S]*?)<\/dc:date>/i]);

    return {
      id: stableId('rss', link || title),
      source: 'rss',
      sourceLabel: `RSS ${new URL(feedUrl).hostname}`,
      sourceUrl: feedUrl,
      title: title || 'RSS item',
      text: truncate(description || title, 500),
      url: link || feedUrl,
      author,
      authorName: author,
      createdAt: parseDate(createdAt),
      lang: 'en',
      score: 0,
      comments: 0,
      reactions: 0,
      views: 0,
      tags: ['rss'],
    };
  });
}

function parseAtomEntries(xml, feedUrl) {
  const entryBlocks = matchAll(xml, /<entry\b[\s\S]*?>([\s\S]*?)<\/entry>/gi);

  return entryBlocks.slice(0, config.RSS_MAX_RESULTS_PER_FEED).map(block => {
    const title = pickFirst(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const description = pickFirst(block, [/<summary[^>]*>([\s\S]*?)<\/summary>/i, /<content[^>]*>([\s\S]*?)<\/content>/i]);
    const author = pickFirst(block, [/<name>([\s\S]*?)<\/name>/i]) || 'rss';
    const createdAt = pickFirst(block, [/<updated>([\s\S]*?)<\/updated>/i, /<published>([\s\S]*?)<\/published>/i]);
    const linkMatch = block.match(/<link[^>]+href="([^"]+)"/i);
    const link = linkMatch?.[1] || feedUrl;

    return {
      id: stableId('rss', link || title),
      source: 'rss',
      sourceLabel: `RSS ${new URL(feedUrl).hostname}`,
      sourceUrl: feedUrl,
      title: title || 'RSS item',
      text: truncate(description || title, 500),
      url: link,
      author,
      authorName: author,
      createdAt: parseDate(createdAt),
      lang: 'en',
      score: 0,
      comments: 0,
      reactions: 0,
      views: 0,
      tags: ['rss'],
    };
  });
}

function parseFeed(xml, feedUrl) {
  if (/<rss[\s>]/i.test(xml) || /<channel>/i.test(xml)) {
    return parseRssItems(xml, feedUrl);
  }

  if (/<feed[\s>]/i.test(xml)) {
    return parseAtomEntries(xml, feedUrl);
  }

  return [];
}

async function crawlRss(logger = console) {
  logger.info('[Source:RSS] Fetching configured RSS feeds');

  const results = await Promise.all(config.RSS_FEEDS.map(async feedUrl => {
    const xml = await fetchText(feedUrl, {
      headers: {
        'User-Agent': config.HTTP_USER_AGENT,
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });

    return parseFeed(xml, feedUrl);
  }));

  const items = dedupeItems(results.flat())
    .map(item => ({ ...item, sortScore: scoreItem(item, config) }))
    .sort((a, b) => b.sortScore - a.sortScore);

  logger.info(`[Source:RSS] Collected ${items.length} items`);
  return items;
}

module.exports = { crawlRss };
