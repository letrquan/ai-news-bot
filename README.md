# AI News Discord Bot

Automated AI news pipeline: **multi-source collection -> OpenAI-compatible curation -> Discord webhook delivery**

## Sources

- X home timeline via authenticated session cookies
- Hacker News via Algolia search API
- Reddit via subreddit search endpoints
- RSS feeds such as OpenAI News and Hugging Face Blog

## Architecture

```
┌──────────────┐
│   Sources    │  X + Hacker News + Reddit + RSS
└──────┬───────┘
       ▼
┌──────────────┐
│  Aggregator  │  Normalize, dedupe, rank, time-filter
└──────┬───────┘
       ▼
┌──────────────┐
│  OpenAI AI   │  Filter, score, summarize
└──────┬───────┘
       ▼
┌──────────────┐
│   Discord    │  Webhook digest embeds
└──────────────┘
```

## Local Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`, then run:

```bash
npm start
```

Run one immediate update and exit:

```bash
npm run run-now
```

Safe test:

```bash
npm run dry-run
```

Safe one-shot test:

```bash
npm run run-now:dry
```

Reset local cache/state:

```bash
npm run reset-cache
```

## Docker Deployment

Build and run:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

The compose setup stores runtime state in `./data/bot-state.db` on the host.

Run one immediate update inside Docker and exit:

```bash
npm run docker:run-now
```

Reset Docker-mounted cache/state:

```bash
npm run docker:reset-cache
```

## Important Config

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLED_SOURCES` | `x,hackernews,reddit,rss` | Comma-separated source list |
| `X_MAX_RESULTS` | `20` | X timeline items to inspect |
| `HACKERNEWS_KEYWORDS` | `AI,LLM,...` | HN query keywords |
| `REDDIT_SUBREDDITS` | `MachineLearning,LocalLLaMA` | Reddit sources |
| `RSS_FEEDS` | OpenAI + Hugging Face feeds | RSS sources |
| `RSS_MAX_RESULTS_PER_FEED` | `25` | Cap fetched entries per RSS feed |
| `HOURS_LOOKBACK` | `6` | Keep only items newer than this |
| `MIN_IMPORTANCE` | `6` | Minimum AI score kept |
| `MAX_POSTS_PER_RUN` | `10` | Maximum items posted per run |
| `AI_PROVIDER` | `auto` | `auto`, `zai`, or another OpenAI-compatible provider label |
| `AI_MAX_INPUT_ITEMS` | `8` | Cap items sent to the model per curation request |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model used for semantic dedupe |
| `SEMANTIC_DEDUPE_ENABLED` | `true` | Enable embedding-based same-story filtering |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.85` | Skip items above this cosine similarity |
| `DRY_RUN` | `false` | Skip Discord posting and log the digest |
| `RUN_ONCE` | `false` | Run a single immediate update and exit |
| `STATE_FILE` | `bot-state.db` | Persistent SQLite state file |

If `x` is enabled in `ENABLED_SOURCES`, `X_AUTH_TOKEN` and `X_CT0` are required. Other sources work without those secrets.

## How It Works

1. Each enabled source crawler fetches items independently.
2. The aggregator normalizes them into one item format.
3. The pipeline deduplicates by ID, semantically removes same-story duplicates, ranks, and drops stale items.
4. The model selects the strongest stories and writes short summaries.
5. Discord receives the top items, while SQLite state in `bot-state.db` prevents reposts.

## Folder Structure

```
ai-news-bot/
├── Dockerfile
├── docker-compose.yml
├── index.js
├── .env.example
├── src/
│   ├── config.js
│   ├── orchestrator.js
│   ├── modules/
│   │   ├── ai-filter.js
│   │   ├── discord.js
│   │   └── sources/
│   │       ├── common.js
│   │       ├── hackernews.js
│   │       ├── index.js
│   │       ├── reddit.js
│   │       ├── rss.js
│   │       └── x.js
│   └── utils/
│       ├── cache.js
│       └── logger.js
```

## Notes

- `DRY_RUN=true` exercises the full collection and curation pipeline without sending to Discord.
- Delivery uses an incoming Discord webhook URL, which is stateless and supported by Discord.
- PM2 scripts remain available, but Docker is now the preferred deployment path.
- The AI layer now applies provider-specific request shaping for Z.AI / GLM models, including disabled thinking and JSON mode.
- Runtime state is stored in SQLite via `better-sqlite3`, with one-time migration from legacy `bot-state.json`.
- Semantic dedupe uses `text-embedding-3-small` against recently posted items. For Z.AI chat setups, set a real `OPENAI_EMBEDDING_API_KEY` to enable it.
