# AI News Discord Bot

Automated AI news pipeline: **Apify (crawl X/Twitter) → OpenAI (filter & summarize) → Discord selfbot (send updates)**

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Apify      │────▶│  OpenAI AI   │────▶│  Discord    │
│  Twitter     │     │  Filter &    │     │  Selfbot    │
│  Crawler     │     │  Summarizer  │     │  (Embeds)   │
└─────────────┘     └──────────────┘     └─────────────┘
     Step 1               Step 2              Step 3
```

## Setup

### 1. Install dependencies
```bash
cd ai-news-bot
npm install
```

### 2. Get API keys

| Key | Where to get |
|-----|-------------|
| **Discord Token** | Open Discord in browser → DevTools → Application → Local Storage → `token` |
| **Apify Token** | [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations) |
| **OpenAI Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

### 3. Configure
```bash
cp .env.example .env
# Edit .env with your keys
nano .env
```

### 4. Run
```bash
node index.js
```

## Config Options

| Variable | Default | Description |
|----------|---------|-------------|
| `TWITTER_SEARCH_TERMS` | `AI,LLM,GPT...` | Comma-separated search terms |
| `TWITTER_MAX_RESULTS` | `20` | Tweets per crawl |
| `HOURS_LOOKBACK` | `3` | Only include tweets from last N hours |
| `SCHEDULE_CRON` | `0 */3 * * *` | Cron schedule (default: every 3h) |
| `FILTER_PROMPT` | ... | AI instruction for what to keep |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |

## How it works

1. **Crawl**: Apify's Twitter Scraper fetches recent tweets matching your search terms
2. **Filter**: OpenAI analyzes each tweet, scores importance 1-10, categorizes, summarizes
3. **Deliver**: Discord selfbot sends rich embeds with headline, summary, source link, engagement stats

## Cron Examples

```
0 */2 * * *     # Every 2 hours
0 9,12,18,21 * * *   # 4 times a day
*/30 * * * *    # Every 30 minutes
```

## Folder Structure

```
ai-news-bot/
├── index.js                  # Entry point
├── .env.example              # Config template
├── src/
│   ├── config.js             # Loads .env
│   ├── orchestrator.js       # Pipeline + scheduler
│   └── modules/
│       ├── crawler.js        # Apify Twitter scraper
│       ├── ai-filter.js      # OpenAI filter/summarize
│       └── discord.js        # Discord selfbot sender
```

## ⚠️ Disclaimer

Using selfbots violates Discord's ToS. Use at your own risk. Consider using a bot token + webhook as an alternative if that's a concern.
