const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
});

function extractJsonArray(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (Array.isArray(parsed.items)) {
      return parsed.items;
    }

    if (Array.isArray(parsed.results)) {
      return parsed.results;
    }
  } catch {}

  const match = trimmed.match(/\[[\s\S]*\]/);

  if (!match) {
    throw new Error('Model response did not contain a JSON array');
  }

  const parsedArray = JSON.parse(match[0]);
  if (Array.isArray(parsedArray)) {
    return parsedArray;
  }

  throw new Error('Model response array parse failed');
}

async function repairJsonArray(rawContent) {
  const response = await openai.chat.completions.create({
    model: config.OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'Convert the user content into valid JSON only. Return either a JSON array or an object with an "items" array. No markdown.' },
      { role: 'user', content: rawContent },
    ],
    temperature: 0,
    max_tokens: 1600,
  });

  return extractJsonArray(response.choices[0].message.content.trim());
}

function buildFallbackResults(items, logger = console) {
  logger.warn('[AI Filter] Falling back to deterministic local curation');

  return items
    .slice(0, config.MAX_POSTS_PER_RUN)
    .map((item, index) => ({
      index: index + 1,
      title: item.title,
      summary: item.text.slice(0, 220) || item.title,
      importance: Math.max(config.MIN_IMPORTANCE, Math.min(8, Math.round((item.sortScore || 0) / 50) + config.MIN_IMPORTANCE)),
      category: item.source === 'rss' ? 'Product' : item.source === 'hackernews' ? 'Industry' : 'Other',
      item,
    }));
}

function renderMetrics(item) {
  const metrics = [];

  if (item.score) metrics.push(`score=${item.score}`);
  if (item.comments) metrics.push(`comments=${item.comments}`);
  if (item.reactions) metrics.push(`reactions=${item.reactions}`);
  if (item.views) metrics.push(`views=${item.views}`);

  return metrics.join(', ') || 'none';
}

async function filterAndSummarize(items, logger = console) {
  if (!items.length) {
    logger.info('[AI Filter] No items to process');
    return [];
  }

  const itemsText = items.map((item, index) => {
    return [
      `[${index + 1}] Source=${item.sourceLabel}`,
      `Title: ${item.title}`,
      `Author: ${item.author}`,
      `Created: ${item.createdAt}`,
      `Metrics: ${renderMetrics(item)}`,
      `URL: ${item.url}`,
      `Body: ${item.text}`,
    ].join('\n');
  }).join('\n\n');

  const prompt = `You are an expert AI/tech news curator. Your job is to filter and summarize the most important items from multiple sources.

USER PREFERENCES:
${config.FILTER_PROMPT}

RAW ITEMS:
${itemsText}

INSTRUCTIONS:
1. Filter OUT: spam, memes without substance, vague hype, reposted chatter, low-signal personal updates
2. Keep: real announcements, research papers, product launches, significant industry moves, insightful analysis
3. Prefer original sources and substantive writeups over reactions
4. Score each kept item 1-10 on importance
5. Return ONLY a JSON array
6. Prefer fewer high-signal items over many mediocre ones
7. Ignore duplicate coverage of the same story unless the item adds materially new information

Format:
[
  {
    "index": <number>,
    "title": "<short headline>",
    "summary": "<1-2 sentence summary>",
    "importance": <1-10>,
    "category": "<Research|Product|Industry|Regulation|Open Source|Other>"
  }
]

Return empty array [] if nothing is noteworthy. Sort by importance descending.`;

  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a precise news curator. Always respond with valid JSON only. No markdown code fences.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content.trim();
    let results;

    try {
      results = extractJsonArray(content);
    } catch (parseErr) {
      logger.warn(`[AI Filter] Primary parse failed, attempting repair: ${parseErr.message}`);
      results = await repairJsonArray(content);
    }

    logger.info(`[AI Filter] Kept ${results.length}/${items.length} items before post-filtering`);

    return results
      .map(result => ({
        ...result,
        item: items[result.index - 1],
      }))
      .filter(result => result.item && Number.isFinite(result.importance) && result.importance >= config.MIN_IMPORTANCE)
      .sort((a, b) => b.importance - a.importance);
  } catch (err) {
    logger.error(`[AI Filter] Error: ${err.message}`);
    return buildFallbackResults(items, logger);
  }
}

module.exports = { filterAndSummarize };
