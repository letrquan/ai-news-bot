const config = require('../../config');
const { parseDate, scoreItem, stableId, dedupeItems, finalizeItem } = require('./common');

const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const GRAPHQL_BASE = 'https://x.com/i/api/graphql';

const HOME_TIMELINE = {
  queryId: '-X_hcgQzmHGl29-UXxz4sw',
  operationName: 'HomeTimeline',
};

const HOME_LATEST = {
  queryId: 'U0cdisy7QFIoTfu3-Okw0A',
  operationName: 'HomeLatestTimeline',
};

const DEFAULT_FEATURES = {
  rweb_video_screen_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const FIELD_TOGGLES = {
  withAuxiliaryUserLabels: false,
};

function buildHeaders() {
  return {
    Authorization: `Bearer ${BEARER_TOKEN}`,
    Cookie: `auth_token=${config.X_AUTH_TOKEN}; ct0=${config.X_CT0};`,
    'X-Csrf-Token': config.X_CT0,
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://x.com/home',
    'Content-Type': 'application/json',
  };
}

async function fetchTimeline(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

  const variables = {
    count: config.X_MAX_RESULTS,
    includePromotedContent: false,
    latestControlAvailable: true,
    requestContext: 'launch',
  };

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(DEFAULT_FEATURES),
    fieldToggles: JSON.stringify(FIELD_TOGGLES),
  });

  const url = `${GRAPHQL_BASE}/${endpoint.queryId}/${endpoint.operationName}?${params}`;

  try {
    const res = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Timeline ${endpoint.operationName} failed: ${res.status} - ${text.slice(0, 300)}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePost(data, fallbackUser) {
  const legacy = data?.legacy || {};
  const userLegacy = data?.core?.user_results?.result?.legacy || fallbackUser || {};
  const text = legacy.full_text || '';

  return {
    id: stableId('x', data?.rest_id || `${userLegacy.screen_name}:${text.slice(0, 20)}`),
    source: 'x',
    sourceLabel: 'X',
    sourceUrl: 'https://x.com/home',
    title: text.split('\n')[0].slice(0, 120) || `Post by @${userLegacy.screen_name || 'unknown'}`,
    text,
    url: `https://x.com/${userLegacy.screen_name}/status/${data?.rest_id}`,
    author: userLegacy.screen_name || 'unknown',
    authorName: userLegacy.name || userLegacy.screen_name || 'Unknown',
    createdAt: parseDate(legacy.created_at),
    lang: legacy.lang || 'en',
    score: legacy.favorite_count || 0,
    comments: legacy.reply_count || 0,
    reactions: legacy.retweet_count || 0,
    views: data?.views?.count || '0',
    tags: ['social'],
  };
}

function parseTimelineItems(data) {
  const instructions = data?.data?.home?.home_timeline_urt?.instructions || [];
  const entries = [];

  for (const instruction of instructions) {
    if (instruction.entries) {
      entries.push(...instruction.entries);
    }
  }

  const items = [];

  for (const entry of entries) {
    const result = entry?.content?.itemContent?.tweet_results?.result;
    if (!result) continue;

    const tweet = result?.tweet || result;
    const legacy = tweet?.legacy || {};
    const userLegacy = tweet?.core?.user_results?.result?.legacy || {};
    const text = legacy.full_text || '';

    if (!text) continue;

    const isRetweet = !!legacy.retweeted_status_result || text.startsWith('RT @');
    if (isRetweet) {
      const rtResult = legacy.retweeted_status_result?.result;
      if (rtResult) {
        items.push(normalizePost(rtResult, userLegacy));
      }
      continue;
    }

    items.push(normalizePost(tweet));
  }

  return dedupeItems(items);
}

function filterItems(items) {
  const blockedAccounts = new Set(config.BLOCKED_ACCOUNTS.map(item => item.toLowerCase()));
  const spamPatterns = ['follow me', 'giveaway', 'airdrop', 'gm ', 'good morning'];

  return items.filter(item => {
    if (!item.text || item.lang !== 'en') {
      return false;
    }

    if (blockedAccounts.has(item.author.toLowerCase())) {
      return false;
    }

    const normalized = item.text.toLowerCase();
    return !spamPatterns.some(pattern => normalized.includes(pattern));
  });
}

async function crawlX(logger = console) {
  logger.info('[Source:X] Fetching authenticated home timeline');

  let data;
  try {
    data = await fetchTimeline(HOME_TIMELINE);
  } catch (err) {
    logger.warn(`[Source:X] HomeTimeline failed: ${err.message}`);
    logger.info('[Source:X] Trying HomeLatestTimeline');
    data = await fetchTimeline(HOME_LATEST);
  }

  const items = filterItems(parseTimelineItems(data))
    .map(item => finalizeItem(item, config))
    .filter(Boolean)
    .map(item => ({ ...item, sortScore: scoreItem(item, config) }))
    .sort((a, b) => b.sortScore - a.sortScore);

  logger.info(`[Source:X] Collected ${items.length} items`);
  return items;
}

module.exports = { crawlX };
