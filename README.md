# AI News Discord Bot

Automated AI news pipeline: **X home timeline crawl -> OpenAI-compatible filtering/summarization -> Discord delivery**

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   X / Twitter│────▶│  OpenAI AI   │────▶│  Discord    │
│  Home Timeline│    │  Filter &    │     │  Selfbot    │
│  Crawler      │    │  Summarizer  │     │  (Embeds)   │
└──────────────┘     └──────────────┘     └─────────────┘
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
| **Discord Token** | Open Discord in browser -> DevTools -> Application -> Local Storage -> `token` |
| **OpenAI Key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **X Auth Cookies** | Authenticated X session values for `auth_token` and `ct0` |

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

### 5. Test safely
```bash
DRY_RUN=true node index.js
```

## Config Options

| Variable | Default | Description |
|----------|---------|-------------|
| `TWITTER_MAX_RESULTS` | `20` | Timeline tweets to inspect per run |
| `HOURS_LOOKBACK` | `3` | Only include tweets from last N hours |
| `SCHEDULE_CRON` | `0 */3 * * *` | Cron schedule |
| `FILTER_PROMPT` | ... | AI instruction for what to keep |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI-compatible model to use |
| `MIN_IMPORTANCE` | `6` | Minimum AI score to keep |
| `MAX_POSTS_PER_RUN` | `10` | Maximum items sent to Discord |
| `DRY_RUN` | `false` | Skip Discord login and print the digest |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` |
| `TIMEZONE` | `Asia/Ho_Chi_Minh` | Scheduler and timestamp timezone |

## How it works

1. **Crawl**: fetch your X home timeline through authenticated GraphQL endpoints.
2. **Pre-filter**: remove blocked accounts, obvious low-signal posts, and duplicate tweet IDs.
3. **Curate**: use an OpenAI-compatible model to score, categorize, and summarize the strongest items.
4. **Deliver**: send embeds and quick links to Discord, or log the payload in dry-run mode.
5. **Persist**: write seen/post history and recent run summaries to `bot-state.json`.

## Cron Examples

```
0 */2 * * *          # Every 2 hours
0 9,12,18,21 * * *   # 4 times a day
*/30 * * * *         # Every 30 minutes
```

## Folder Structure

```
ai-news-bot/
├── index.js                  # Entry point
├── .env.example              # Config template
├── bot-state.json            # Runtime state (created automatically)
├── src/
│   ├── config.js             # Config parsing + validation
│   ├── orchestrator.js       # Pipeline + scheduler
│   ├── modules/
│   │   ├── crawler.js        # X home timeline crawler
│   │   ├── ai-filter.js      # OpenAI filter/summarize
│   │   └── discord.js        # Discord selfbot sender
│   └── utils/
│       ├── cache.js          # Seen/posted state store
│       └── logger.js         # Structured logger
```

## Improvements In This Repo

- Startup config validation now fails fast with a clear message.
- `DRY_RUN=true` lets you test crawl + curation without touching Discord.
- A persistent `bot-state.json` file tracks seen tweets, posted tweets, and recent run history.
- Logging is structured and level-based for easier debugging.
- Docs now match the current code path instead of the old Apify-based description.

## Disclaimer

Using selfbots violates Discord's ToS. Use at your own risk. Consider using a bot token or webhook as a safer alternative.
