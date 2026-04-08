const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '..', 'sent-tweets.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[Cache] Failed to save:', err.message);
  }
}

function filterDuplicate(tweets) {
  const cache = loadCache();
  const now = Date.now();
  const MAX_AGE = 24 * 60 * 60 * 1000;

  for (const key of Object.keys(cache)) {
    if (now - cache[key] > MAX_AGE) {
      delete cache[key];
    }
  }

  const newTweets = tweets.filter(t => !cache[t.id]);

  for (const t of tweets) {
    cache[t.id] = now;
  }

  saveCache(cache);
  console.log(`[Cache] ${newTweets.length} new / ${tweets.length} total (${Object.keys(cache).length} cached)`);

  return newTweets;
}

module.exports = { filterDuplicate };
