const OpenAI = require('openai');
const config = require('../config');

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
});

async function filterAndSummarize(tweets) {
  if (!tweets.length) {
    console.log('[AI Filter] No tweets to process');
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

    let content = response.choices[0].message.content.trim();
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

    const results = JSON.parse(content);
    console.log(`[AI Filter] Kept ${results.length}/${tweets.length} tweets`);

    return results
      .map(r => ({
        ...r,
        tweet: tweets[r.index - 1],
      }))
      .filter(r => r.tweet)
      .sort((a, b) => b.importance - a.importance);
  } catch (err) {
    console.error('[AI Filter] Error:', err.message);
    return [];
  }
}

module.exports = { filterAndSummarize };
