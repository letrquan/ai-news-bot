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
  return String(value)
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

function cleanText(value = '') {
  return stripHtml(String(value))
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value = '', maxLength = 400) {
  const normalized = String(value || '');
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function parseDate(value, fallback = new Date().toISOString()) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  const now = Date.now();
  if (parsed.getTime() > now + 60 * 60 * 1000) {
    return new Date(now).toISOString();
  }

  return parsed.toISOString();
}

function stableId(source, rawId) {
  return `${source}:${rawId}`;
}

function sanitizeUrl(value, fallback = '') {
  if (!value) {
    return fallback;
  }

  try {
    const url = new URL(String(value).trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return fallback;
    }

    url.hash = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function countWords(value = '') {
  return cleanText(value).split(/\s+/).filter(Boolean).length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeForPrompt(value = '', maxLength = 900) {
  return truncate(cleanText(value)
    .replace(/```+/g, '`')
    .replace(/<(?:system|assistant|user)>/gi, '[role-tag]')
    .replace(/\b(ignore (?:all|any|the|previous) instructions?|follow these instructions|system prompt|developer message|return only|assistant:|user:)\b/gi, '[redacted-instructional-text]'), maxLength);
}

function buildKeywordSignals(combined) {
  return {
    researchSignals: /\b(paper|research|arxiv|study|benchmark|evaluation|eval|dataset|training|fine-tuning|finetuning|alignment|interpretability|reasoning|retrieval|synthetic data|world model)\b/i.test(combined),
    toolSignals: /\b(tool|toolkit|framework|sdk|agent|agents|orchestration|automation|workflow|tracing|observability|copilot|assistant|browser use|computer use)\b/i.test(combined),
    openSourceSignals: /\b(open source|github|repo|repository|model weights|open weights|apache-2\.0|mit license)\b/i.test(combined),
    infraSignals: /\b(inference|serving|runtime|quantization|latency|throughput|deployment|gpu|webgpu|cuda|acceleration|embeddings|vector search|rag|lora|fine-tuning infrastructure)\b/i.test(combined),
    benchmarkSignals: /\b(benchmark|eval|evaluation|leaderboard|accuracy|hallucination|regression|scorecard)\b/i.test(combined),
    multimodalSignals: /\b(multimodal|vision|video|image|speech|audio|voice|vlm|text-to-speech|speech-to-speech)\b/i.test(combined),
    roboticsSignals: /\b(robotics|robot|embodied|manipulation|navigation|sim-to-real)\b/i.test(combined),
  };
}

function buildQualityMetadata(item) {
  const title = cleanText(item.title || '');
  const text = cleanText(item.text || '');
  const combined = `${title} ${text}`.trim().toLowerCase();
  const url = sanitizeUrl(item.url || '', '');
  const sourceUrl = sanitizeUrl(item.sourceUrl || '', '');
  const domain = getHostname(url);
  const sourceDomain = getHostname(sourceUrl);
  const score = Number(item.score || 0);
  const comments = Number(item.comments || 0);
  const reactions = Number(item.reactions || 0);
  const views = Number(item.views || 0);
  const wordCount = countWords(`${title} ${text}`);
  const promptInjectionSignals = /(ignore (?:all|any|the|previous) instructions?|follow these instructions|system prompt|developer message|assistant:|user:)/i.test(combined);
  const lowSignalPatterns = [
    /\b(giveaway|airdrop|follow me|gm|good morning)\b/i,
    /\b(big things coming|huge news soon|stay tuned|more later)\b/i,
    /\bwhat do you think\??\b/i,
    /\bcheck this out\b/i,
    /\bcan you believe it\??\b/i,
    /\blook at this\b/i,
  ];
  const sourceTrustMap = {
    rss: 1.35,
    hackernews: 1.2,
    reddit: 0.95,
    x: 0.9,
  };

  const isPlatformDiscussion = ['x', 'reddit'].includes(item.source);
  const hasExternalUrl = Boolean(domain) && domain !== sourceDomain;
  const keywordSignals = buildKeywordSignals(combined);
  const highSignalTopic = Object.values(keywordSignals).some(Boolean);
  const isSubstantive = wordCount >= 12 || cleanText(text).length >= 80 || (hasExternalUrl && highSignalTopic);
  const titleLooksVague = /^(can you believe it\??|look at this|this is wild|wow+|interesting\.?|thoughts\??|what do you think\??)$/i.test(title)
    || (title.length < 28 && /[!?]$/.test(title) && !hasExternalUrl);
  const noEvidenceSocial = isPlatformDiscussion && !hasExternalUrl && !keywordSignals.researchSignals && !keywordSignals.toolSignals && !keywordSignals.openSourceSignals && !keywordSignals.infraSignals && !keywordSignals.benchmarkSignals && !keywordSignals.multimodalSignals && !keywordSignals.roboticsSignals;
  const lowSignal = lowSignalPatterns.some(pattern => pattern.test(combined)) || titleLooksVague;
  const reactionOnly = isPlatformDiscussion && !hasExternalUrl && !isSubstantive && score < 25 && comments < 8 && reactions < 10;
  const normalizedEngagement = Math.log1p((score * 2) + (comments * 1.5) + reactions + (views / 250));
  const originality = clamp((hasExternalUrl ? 1 : 0.35) + (item.source === 'rss' ? 0.2 : 0) + (item.source === 'hackernews' ? 0.1 : 0), 0, 1.4);
  const sourceTrust = sourceTrustMap[item.source] || 1;
  const rejectionReasons = [];

  if (!title && !text) {
    rejectionReasons.push('missing_content');
  }

  if (!url) {
    rejectionReasons.push('invalid_url');
  }

  if (item.lang && item.lang !== 'en' && item.lang !== 'und') {
    rejectionReasons.push('unsupported_language');
  }

  if (wordCount < 4 && !hasExternalUrl && !highSignalTopic) {
    rejectionReasons.push('insufficient_substance');
  }

  if (lowSignal) {
    rejectionReasons.push('low_signal_phrase');
  }

  if (reactionOnly) {
    rejectionReasons.push('reaction_only');
  }

  if (noEvidenceSocial && lowSignal) {
    rejectionReasons.push('weak_social_chatter');
  }

  return {
    domain,
    sourceDomain,
    hasExternalUrl,
    isSubstantive,
    lowSignal,
    reactionOnly,
    noEvidenceSocial,
    titleLooksVague,
    promptInjectionSignals,
    wordCount,
    sourceTrust,
    originality,
    normalizedEngagement,
    rejectionReasons,
    ...keywordSignals,
  };
}

function finalizeItem(item, config) {
  const sourceUrl = sanitizeUrl(item.sourceUrl || '', item.sourceUrl || '');
  const normalized = {
    ...item,
    sourceLabel: cleanText(item.sourceLabel || item.source || 'Unknown Source'),
    sourceUrl,
    title: truncate(cleanText(item.title || item.text || 'Untitled item'), 200),
    text: truncate(cleanText(item.text || item.title || ''), 1200),
    url: sanitizeUrl(item.url || '', sourceUrl),
    author: truncate(cleanText(item.author || item.authorName || 'unknown'), 80),
    authorName: truncate(cleanText(item.authorName || item.author || 'unknown'), 120),
    createdAt: parseDate(item.createdAt),
    lang: item.lang || 'en',
    score: Number(item.score || 0),
    comments: Number(item.comments || 0),
    reactions: Number(item.reactions || 0),
    views: Number(item.views || 0),
    tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
  };

  const quality = buildQualityMetadata(normalized, config);
  if (quality.rejectionReasons.length) {
    return null;
  }

  return {
    ...normalized,
    quality,
    safePromptTitle: sanitizeForPrompt(normalized.title, 220),
    safePromptText: sanitizeForPrompt(normalized.text, 900),
  };
}

function scoreItem(item, config) {
  const priorityAccounts = new Set(config.PRIORITY_ACCOUNTS.map(value => value.toLowerCase()));
  const quality = item.quality || buildQualityMetadata(item);
  const priorityBoost = priorityAccounts.has((item.author || '').toLowerCase()) ? 30 : 0;
  const externalLinkBoost = quality.hasExternalUrl ? 14 : 0;
  const evidenceBoost = (quality.hasExternalUrl && (quality.researchSignals || quality.toolSignals || quality.openSourceSignals || quality.infraSignals || quality.benchmarkSignals || quality.multimodalSignals || quality.roboticsSignals)) ? 10 : 0;
  const substanceBoost = quality.isSubstantive ? 10 : (quality.hasExternalUrl && (quality.researchSignals || quality.toolSignals || quality.openSourceSignals || quality.infraSignals || quality.benchmarkSignals) ? 2 : -8);
  const lowSignalPenalty = quality.lowSignal ? 20 : 0;
  const reactionPenalty = quality.reactionOnly ? 20 : 0;
  const promptInjectionPenalty = quality.promptInjectionSignals ? 8 : 0;
  const weakSocialPenalty = quality.noEvidenceSocial ? 18 : 0;
  const vagueTitlePenalty = quality.titleLooksVague ? 12 : 0;
  const researchBoost = quality.researchSignals ? 8 : 0;
  const toolBoost = quality.toolSignals ? 7 : 0;
  const openSourceBoost = quality.openSourceSignals ? 7 : 0;
  const infraBoost = quality.infraSignals ? 8 : 0;
  const benchmarkBoost = quality.benchmarkSignals ? 7 : 0;
  const multimodalBoost = quality.multimodalSignals ? 6 : 0;
  const roboticsBoost = quality.roboticsSignals ? 6 : 0;

  return Math.round(
    priorityBoost
    + (quality.sourceTrust * 18)
    + (quality.originality * 14)
    + (quality.normalizedEngagement * 8)
    + externalLinkBoost
    + evidenceBoost
    + substanceBoost
    + researchBoost
    + toolBoost
    + openSourceBoost
    + infraBoost
    + benchmarkBoost
    + multimodalBoost
    + roboticsBoost
    - lowSignalPenalty
    - reactionPenalty
    - promptInjectionPenalty
    - weakSocialPenalty
    - vagueTitlePenalty
  );
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
  cleanText,
  dedupeItems,
  fetchJson,
  fetchText,
  finalizeItem,
  getHostname,
  parseDate,
  sanitizeForPrompt,
  sanitizeUrl,
  scoreItem,
  stableId,
  stripHtml,
  truncate,
};
