const config = require('../config');

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

async function fetchTimeline(endpoint, logger = console) {
  const headers = buildHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

  const variables = {
    count: config.TWITTER_MAX_RESULTS,
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
  logger.debug(`[Crawler] Fetching ${endpoint.operationName}`);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Timeline ${endpoint.operationName} failed: ${res.status} - ${text.slice(0, 300)}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlTweets(logger = console) {
  logger.info('[Crawler] Fetching Home Timeline (your FYP)...');

  let data;
  try {
    data = await fetchTimeline(HOME_TIMELINE, logger);
  } catch (err) {
    logger.warn(`[Crawler] HomeTimeline failed: ${err.message}`);
    logger.info('[Crawler] Trying HomeLatestTimeline...');
    data = await fetchTimeline(HOME_LATEST, logger);
  }

  const tweets = parseTimelineTweets(data);
  const filteredTweets = filterTimelineTweets(tweets, config);
  const rankedTweets = rankTweets(filteredTweets, config);

  logger.info(`[Crawler] Found ${rankedTweets.length} usable tweets from timeline`);
  return rankedTweets;
}

function parseTimelineTweets(data) {
  const instructions = data?.data?.home?.home_timeline_urt?.instructions || [];
  const entries = [];

  for (const instruction of instructions) {
    if (instruction.entries) {
      entries.push(...instruction.entries);
    }
  }

  const tweets = [];

  for (const entry of entries) {
    const content = entry?.content;
    if (!content) continue;

    const result = content?.itemContent?.tweet_results?.result;
    if (!result) continue;

    const tweet = result?.tweet || result;
    const legacy = tweet?.legacy || {};
    const core = tweet?.core?.user_results?.result || {};
    const userLegacy = core?.legacy || {};

    const text = legacy.full_text || '';
    const isRetweet = !!legacy.retweeted_status_result || text.startsWith('RT @');

    if (isRetweet) {
      const rtResult = legacy.retweeted_status_result?.result;
      if (rtResult) {
        const rtLegacy = rtResult.legacy || {};
        const rtCore = rtResult.core?.user_results?.result?.legacy || {};
        tweets.push({
          id: rtResult.rest_id || tweet.rest_id,
          text: rtLegacy.full_text || text,
          url: `https://x.com/${rtCore.screen_name}/status/${rtResult.rest_id}`,
          author: rtCore.screen_name || userLegacy.screen_name || 'unknown',
          authorName: rtCore.name || userLegacy.name || 'Unknown',
          likes: rtLegacy.favorite_count || 0,
          retweets: rtLegacy.retweet_count || 0,
          replies: rtLegacy.reply_count || 0,
          views: rtResult.views?.count || '0',
          createdAt: rtLegacy.created_at || new Date().toISOString(),
          media: (rtLegacy.entities?.media || []).map(m => m.media_url_https).filter(Boolean),
          isRetweet: true,
          lang: rtLegacy.lang || 'en',
        });
      }
      continue;
    }

    tweets.push({
      id: tweet?.rest_id || entry.entryId,
      text,
      url: `https://x.com/${userLegacy.screen_name}/status/${tweet?.rest_id}`,
      author: userLegacy.screen_name || 'unknown',
      authorName: userLegacy.name || 'Unknown',
      likes: legacy.favorite_count || 0,
      retweets: legacy.retweet_count || 0,
      replies: legacy.reply_count || 0,
      views: tweet?.views?.count || '0',
      createdAt: legacy.created_at || new Date().toISOString(),
      media: (legacy.entities?.media || []).map(m => m.media_url_https).filter(Boolean),
      isRetweet: false,
      lang: legacy.lang || 'en',
    });
  }

  return dedupeById(tweets);
}

function filterTimelineTweets(tweets, currentConfig) {
  const blockedAccounts = new Set(currentConfig.BLOCKED_ACCOUNTS.map(item => item.toLowerCase()));
  const spamPatterns = ['follow me', 'giveaway', 'airdrop', 'gm ', 'good morning'];

  return tweets.filter(tweet => {
    if (!tweet.text || tweet.lang !== 'en') {
      return false;
    }

    if (blockedAccounts.has(tweet.author.toLowerCase())) {
      return false;
    }

    const normalized = tweet.text.toLowerCase();
    return !spamPatterns.some(pattern => normalized.includes(pattern));
  });
}

function rankTweets(tweets, currentConfig) {
  const priorityAccounts = new Set(currentConfig.PRIORITY_ACCOUNTS.map(item => item.toLowerCase()));

  return tweets
    .map(tweet => ({
      ...tweet,
      sortScore:
        (priorityAccounts.has(tweet.author.toLowerCase()) ? 1000 : 0) +
        tweet.likes +
        tweet.retweets * 2 +
        tweet.replies * 1.5 +
        Number(tweet.views || 0) / 100,
    }))
    .sort((a, b) => b.sortScore - a.sortScore);
}

function dedupeById(tweets) {
  const seen = new Set();
  const deduped = [];

  for (const tweet of tweets) {
    if (seen.has(tweet.id)) {
      continue;
    }

    seen.add(tweet.id);
    deduped.push(tweet);
  }

  return deduped;
}

async function crawlTweetsFallback(logger = console) {
  logger.info('[Crawler] Fallback uses the same timeline flow');
  return crawlTweets(logger);
}

module.exports = { crawlTweets, crawlTweetsFallback };
