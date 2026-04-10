# AI News Discord Bot

Automated AI news pipeline: **multi-source collection -> deterministic scoring and safety filtering -> OpenAI-compatible editorial curation -> Discord webhook delivery**

## What It Covers

The bot is now tuned for broader **AI ecosystem coverage**, not just brand-name model news.

It aims to surface:

- major model releases and API changes
- academic research breakthroughs and papers
- useful AI tools and workflow improvements
- open-source repos and framework releases
- inference, deployment, and infra advances
- benchmarks and evaluation work
- multimodal, speech, vision, and robotics progress
- applied AI systems with technical substance
- regulation and policy changes with real AI impact

It tries to downrank or reject:

- vague hype and teaser posts
- reaction-only social chatter
- generic listicles and thin wrappers
- unsupported benchmark boasting
- duplicate or low-evidence coverage

## Sources

- X home timeline via authenticated session cookies
- Hacker News via Algolia search API
- Reddit via subreddit search endpoints
- RSS feeds across labs, model vendors, research, and AI tooling blogs

## Architecture

```
┌──────────────┐
│   Sources    │  X + Hacker News + Reddit + RSS
└──────┬───────┘
       ▼
┌──────────────┐
│  Aggregator  │  Normalize, validate, dedupe, rank, time-filter
└──────┬───────┘
       ▼
┌──────────────┐
│  OpenAI AI   │  Editorial filter, score, summarize
└──────┬───────┘
       ▼
┌──────────────┐
│   Discord    │  Webhook digest embeds
└──────────────┘
```

## Local Setup

### Requirements

- Node.js 18+
- an OpenAI-compatible chat API key
- X session cookies only if `x` is enabled
- a Discord webhook only for non-dry runs

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
| `HACKERNEWS_KEYWORDS` | broad AI ecosystem query set | HN search terms covering models, research, tools, infra, evals, robotics, and OSS |
| `REDDIT_SUBREDDITS` | `MachineLearning,LocalLLaMA,OpenSourceAI,singularity,artificial,compsci` | Reddit communities used for search |
| `REDDIT_SEARCH_QUERY` | broad AI ecosystem query | Reddit search query covering research, tools, infra, and OSS |
| `RSS_FEEDS` | expanded lab/vendor/tooling feed set | RSS sources across labs, vendors, research, infra, and OSS blogs |
| `RSS_MAX_RESULTS_PER_FEED` | `25` | Cap fetched entries per RSS feed |
| `HOURS_LOOKBACK` | `6` | Keep only items newer than this |
| `MIN_IMPORTANCE` | `6` | Minimum AI score kept |
| `MAX_POSTS_PER_RUN` | `10` | Maximum items posted per run |
| `AI_PROVIDER` | `auto` | `auto`, `zai`, or another OpenAI-compatible provider label |
| `AI_MAX_INPUT_ITEMS` | `16` | Cap items sent to the model per curation request |
| `FILTER_PROMPT` | high-signal AI ecosystem prompt | Editorial guidance for the AI filter |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model used for semantic dedupe |
| `SEMANTIC_DEDUPE_ENABLED` | `true` | Enable embedding-based same-story filtering |
| `SEMANTIC_SIMILARITY_THRESHOLD` | `0.85` | Skip items above this cosine similarity |
| `DRY_RUN` | `false` | Skip Discord posting and log the digest |
| `RUN_ONCE` | `false` | Run a single immediate update and exit |
| `STATE_FILE` | `bot-state.db` | Persistent SQLite state file |

If `x` is enabled in `ENABLED_SOURCES`, `X_AUTH_TOKEN` and `X_CT0` are required. Other sources work without those secrets.

## How It Works

1. Each enabled source crawler fetches items independently.
2. The aggregator normalizes, sanitizes, and scores them into one item format.
3. Deterministic filtering removes stale, weak, invalid, duplicate, and low-signal content.
4. Semantic dedupe and story memory reduce repeat coverage when embedding support is configured.
5. The model acts as an editorial layer: it selects only the strongest stories and writes short summaries.
6. Discord receives the top items, while SQLite state prevents reposts and stores run/source decision history.

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
- Delivery uses an incoming Discord webhook URL and now sanitizes mentions, strips unsafe formatting, and retries transient webhook failures.
- PM2 scripts remain available, but Docker is now the preferred deployment path.
- The AI layer applies provider-specific request shaping for Z.AI / GLM models, including disabled thinking and JSON mode.
- Runtime state is stored in SQLite via `better-sqlite3`, with one-time migration from legacy `bot-state.json`.
- State now also tracks story memory, source health, and per-stage decision logs for tuning.
- Semantic dedupe uses `text-embedding-3-small` against recently posted items. For Z.AI chat setups, set a real `OPENAI_EMBEDDING_API_KEY` to enable it.
- There is currently no formal `npm test` script; validation is primarily done with `node --check` and `npm run run-now:dry`.
