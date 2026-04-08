const config = require('../../config');
const { fetchJson, parseDate, scoreItem, stableId, dedupeItems, truncate } = require('./common');

const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1/search_by_date';

function buildQuery() {
  return config.HACKERNEWS_KEYWORDS.join(' OR ');
}

function mapHit(hit) {
  const title = hit.title || hit.story_title || 'Hacker News post';
  const url = hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const text = truncate(hit.story_text || hit.comment_text || title, 500);

  return {
    id: stableId('hackernews', hit.objectID),
    source: 'hackernews',
    sourceLabel: 'Hacker News',
    sourceUrl: 'https://news.ycombinator.com/',
    title,
    text,
    url,
    author: hit.author || 'unknown',
    authorName: hit.author || 'unknown',
    createdAt: parseDate(hit.created_at),
    lang: 'en',
    score: hit.points || 0,
    comments: hit.num_comments || 0,
    reactions: 0,
    views: 0,
    tags: ['hackernews'],
  };
}

async function crawlHackerNews(logger = console) {
  const params = new URLSearchParams({
    query: buildQuery(),
    tags: 'story',
    hitsPerPage: String(config.HACKERNEWS_MAX_RESULTS),
  });

  logger.info('[Source:HN] Querying Algolia API');
  const data = await fetchJson(`${ALGOLIA_BASE}?${params}`);
  const items = dedupeItems((data.hits || []).map(mapHit))
    .map(item => ({ ...item, sortScore: scoreItem(item, config) }))
    .sort((a, b) => b.sortScore - a.sortScore);

  logger.info(`[Source:HN] Collected ${items.length} items`);
  return items;
}

module.exports = { crawlHackerNews };
