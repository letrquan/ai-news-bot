const config = require('../../config');

function createRequestOptions(extra = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

  return {
    ...extra,
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}

async function fetchJson(url, options = {}) {
  const request = createRequestOptions(options);

  try {
    const res = await fetch(url, request);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${url} ${text.slice(0, 200)}`);
    }

    return res.json();
  } finally {
    request.cleanup();
  }
}

async function fetchText(url, options = {}) {
  const request = createRequestOptions(options);

  try {
    const res = await fetch(url, request);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed: ${res.status} ${url} ${text.slice(0, 200)}`);
    }

    return res.text();
  } finally {
    request.cleanup();
  }
}

function stripHtml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value = '', maxLength = 400) {
  if (!value || value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function parseDate(value, fallback = new Date().toISOString()) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function stableId(source, rawId) {
  return `${source}:${rawId}`;
}

function scoreItem(item, config) {
  const priorityAccounts = new Set(config.PRIORITY_ACCOUNTS.map(value => value.toLowerCase()));
  const priorityBoost = priorityAccounts.has((item.author || '').toLowerCase()) ? 1000 : 0;
  const score = Number(item.score || 0);
  const comments = Number(item.comments || 0);
  const reactions = Number(item.reactions || 0);
  const views = Number(item.views || 0);

  return priorityBoost + score * 2 + comments * 1.5 + reactions + views / 100;
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const key = item.url || `${item.source}:${item.title}:${item.author}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

module.exports = {
  dedupeItems,
  fetchJson,
  fetchText,
  parseDate,
  scoreItem,
  stableId,
  stripHtml,
  truncate,
};
