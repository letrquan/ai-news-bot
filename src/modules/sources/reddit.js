const config = require('../../config');
const { fetchJson, parseDate, scoreItem, stableId, dedupeItems, truncate } = require('./common');

function buildUrl(subreddit) {
  const params = new URLSearchParams({
    limit: String(config.REDDIT_MAX_RESULTS),
    q: config.REDDIT_SEARCH_QUERY,
    restrict_sr: '1',
    sort: 'new',
    t: 'day',
  });

  return `https://www.reddit.com/r/${subreddit}/search.json?${params}`;
}

function mapPost(post, subreddit) {
  const data = post.data || {};

  return {
    id: stableId('reddit', data.id),
    source: 'reddit',
    sourceLabel: `Reddit r/${subreddit}`,
    sourceUrl: `https://www.reddit.com/r/${subreddit}/`,
    title: data.title || `Reddit post from r/${subreddit}`,
    text: truncate(data.selftext || data.title || '', 500),
    url: `https://www.reddit.com${data.permalink}`,
    author: data.author || 'unknown',
    authorName: data.author || 'unknown',
    createdAt: parseDate(new Date((data.created_utc || Date.now() / 1000) * 1000).toISOString()),
    lang: 'en',
    score: data.score || 0,
    comments: data.num_comments || 0,
    reactions: data.ups || 0,
    views: 0,
    tags: ['reddit', subreddit],
  };
}

async function crawlReddit(logger = console) {
  logger.info('[Source:Reddit] Querying subreddit search feeds');

  const results = await Promise.all(config.REDDIT_SUBREDDITS.map(async subreddit => {
    const data = await fetchJson(buildUrl(subreddit), {
      headers: {
        'User-Agent': config.HTTP_USER_AGENT,
      },
    });

    return (data.data?.children || []).map(post => mapPost(post, subreddit));
  }));

  const items = dedupeItems(results.flat())
    .map(item => ({ ...item, sortScore: scoreItem(item, config) }))
    .sort((a, b) => b.sortScore - a.sortScore);

  logger.info(`[Source:Reddit] Collected ${items.length} items`);
  return items;
}

module.exports = { crawlReddit };
