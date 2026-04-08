const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
});

function extractJsonArray(content) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const match = trimmed.match(/\[[\s\S]*\]/);

  if (!match) {
    throw new Error('Model response did not contain a JSON array');
  }

  return JSON.parse(match[0]);
}

async function filterAndSummarize(tweets, logger = console) {
  if (!tweets.length) {
    logger.info('[AI Filter] No tweets to process');
    return [];
  }

  const tweetsText = tweets.map((t, i) => {
    const engagement = `❤️${t.likes} 🔁${t.retweets} 💬${t.replies}`;
    return `[${i + 1}] @${t.author}: "${t.text}"\n    ${engagement}\n    URL: ${t.url}\n    Posted: ${t.createdAt}`;
  }).join('\n\n');

  const prompt = `You are an expert AI/tech news curator. Your job is to filter and summarize the most important tweets.

USER PREFERENCES:
${config.FILTER_PROMPT}

RAW TWEETS:
${tweetsText}

INSTRUCTIONS:
1. Filter OUT: spam, memes without substance, vague hype, engagement farming, crypto shilling
2. Keep: real announcements, research papers, product launches, industry moves, insightful analysis
3. Score each kept tweet 1-10 on importance
4. Return ONLY a JSON array (no markdown fences, no explanation)
5. Prefer fewer high-signal items over many mediocre ones
6. Ignore duplicate coverage of the same story unless the tweet adds materially new information

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
    const results = extractJsonArray(content);
    logger.info(`[AI Filter] Kept ${results.length}/${tweets.length} tweets before post-filtering`);

    return results
      .map(result => ({
        ...result,
        tweet: tweets[result.index - 1],
      }))
      .filter(result => result.tweet && Number.isFinite(result.importance) && result.importance >= config.MIN_IMPORTANCE)
      .sort((a, b) => b.importance - a.importance);
  } catch (err) {
    logger.error(`[AI Filter] Error: ${err.message}`);
    return [];
  }
}

module.exports = { filterAndSummarize };
