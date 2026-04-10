const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_STATE_FILE = path.join(__dirname, '..', '..', 'bot-state.db');
const STATE_VERSION = 4;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RUN_HISTORY = 50;

const dbCache = new Map();

function getStateFile(config) {
  const basePath = config.STATE_FILE || DEFAULT_STATE_FILE;
  if (!config.DRY_RUN) {
    return basePath;
  }

  if (basePath.endsWith('.db')) {
    return basePath.replace(/\.db$/i, '.dry-run.db');
  }

  return `${basePath}.dry-run`;
}

function getLegacyJsonFile(dbPath) {
  if (dbPath.endsWith('.json')) {
    return dbPath;
  }

  return dbPath.replace(/\.db$/i, '.json');
}

function ensureDirectoryExists(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function initializeSchema(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seen_items (
      item_id TEXT PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS posted_items (
      item_id TEXT PRIMARY KEY,
      posted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      summary_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS semantic_memory (
      item_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT NOT NULL,
      sent_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS story_memory (
      story_key TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      domain TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      posted_at INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS item_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_timestamp TEXT NOT NULL,
      stage TEXT NOT NULL,
      item_id TEXT NOT NULL,
      source TEXT NOT NULL,
      decision TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      error_message TEXT,
      meta_json TEXT NOT NULL
    );
  `);

  db.prepare(`
    INSERT INTO metadata (key, value)
    VALUES ('state_version', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(STATE_VERSION));
}

function migrateLegacyJsonIfNeeded(db, dbPath) {
  const alreadyMigrated = db.prepare(`SELECT value FROM metadata WHERE key = 'legacy_json_migrated'`).get();
  if (alreadyMigrated?.value === '1') {
    return;
  }

  const legacyFile = getLegacyJsonFile(dbPath);
  if (!fs.existsSync(legacyFile)) {
    db.prepare(`
      INSERT INTO metadata (key, value)
      VALUES ('legacy_json_migrated', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
  } catch (err) {
    console.error(`[State] Failed to parse legacy JSON state ${legacyFile}: ${err.message}`);
    return;
  }

  const seenItems = parsed.seenItems || parsed.seenTweets || {};
  const postedItems = parsed.postedItems || parsed.postedTweets || {};
  const runs = Array.isArray(parsed.runs) ? parsed.runs : [];

  const migrate = db.transaction(() => {
    const upsertSeen = db.prepare(`
      INSERT INTO seen_items (item_id, seen_at)
      VALUES (?, ?)
      ON CONFLICT(item_id) DO UPDATE SET seen_at = excluded.seen_at
    `);
    const upsertPosted = db.prepare(`
      INSERT INTO posted_items (item_id, posted_at)
      VALUES (?, ?)
      ON CONFLICT(item_id) DO UPDATE SET posted_at = excluded.posted_at
    `);
    const insertRun = db.prepare(`
      INSERT INTO runs (timestamp, summary_json)
      VALUES (?, ?)
    `);

    for (const [itemId, seenAt] of Object.entries(seenItems)) {
      upsertSeen.run(itemId, Number(seenAt) || Date.now());
    }

    for (const [itemId, postedAt] of Object.entries(postedItems)) {
      upsertPosted.run(itemId, Number(postedAt) || Date.now());
    }

    for (const run of runs) {
      insertRun.run(run.timestamp || new Date().toISOString(), JSON.stringify(run));
    }

    db.prepare(`
      INSERT INTO metadata (key, value)
      VALUES ('legacy_json_migrated', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  });

  migrate();

  try {
    fs.renameSync(legacyFile, `${legacyFile}.migrated`);
  } catch (err) {
    console.error(`[State] Failed to rename legacy JSON state ${legacyFile}: ${err.message}`);
  }
}

function getDb(config) {
  const dbPath = getStateFile(config);

  if (dbCache.has(dbPath)) {
    return dbCache.get(dbPath);
  }

  ensureDirectoryExists(dbPath);
  const db = new Database(dbPath);
  initializeSchema(db);
  migrateLegacyJsonIfNeeded(db, dbPath);
  dbCache.set(dbPath, db);
  return db;
}

function pruneState(db, config, now = Date.now()) {
  const cutoff = now - MAX_AGE_MS;
  const semanticCutoff = now - config.SEMANTIC_MEMORY_MAX_AGE_HOURS * 60 * 60 * 1000;
  const storyCutoff = now - config.STORY_MEMORY_MAX_AGE_HOURS * 60 * 60 * 1000;
  db.prepare('DELETE FROM seen_items WHERE seen_at < ?').run(cutoff);
  db.prepare('DELETE FROM posted_items WHERE posted_at < ?').run(cutoff);
  db.prepare('DELETE FROM semantic_memory WHERE sent_at < ?').run(semanticCutoff);
  db.prepare('DELETE FROM story_memory WHERE last_seen_at < ?').run(storyCutoff);

  const runCount = db.prepare('SELECT COUNT(*) AS count FROM runs').get().count;
  const excessRuns = runCount - MAX_RUN_HISTORY;
  if (excessRuns > 0) {
    db.prepare(`
      DELETE FROM runs
      WHERE id IN (
        SELECT id FROM runs
        ORDER BY id ASC
        LIMIT ?
      )
    `).run(excessRuns);
  }

  const sourceRunCount = db.prepare('SELECT COUNT(*) AS count FROM source_runs').get().count;
  const excessSourceRuns = sourceRunCount - config.SOURCE_HEALTH_HISTORY_LIMIT;
  if (excessSourceRuns > 0) {
    db.prepare(`
      DELETE FROM source_runs
      WHERE id IN (
        SELECT id FROM source_runs
        ORDER BY id ASC
        LIMIT ?
      )
    `).run(excessSourceRuns);
  }

  const decisionCount = db.prepare('SELECT COUNT(*) AS count FROM item_decisions').get().count;
  const excessDecisions = decisionCount - 5000;
  if (excessDecisions > 0) {
    db.prepare(`
      DELETE FROM item_decisions
      WHERE id IN (
        SELECT id FROM item_decisions
        ORDER BY id ASC
        LIMIT ?
      )
    `).run(excessDecisions);
  }
}

function logItemDecisions(stage, items, decision, config, runTimestamp) {
  if (!items?.length) {
    return;
  }

  const db = getDb(config);
  pruneState(db, config);

  const insertDecision = db.prepare(`
    INSERT INTO item_decisions (run_timestamp, stage, item_id, source, decision, reasons_json, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(decisionItems => {
    for (const item of decisionItems) {
      const baseItem = item.item || item;
      const reasons = item.reasons || baseItem.quality?.rejectionReasons || [];
      insertDecision.run(
        runTimestamp,
        stage,
        baseItem.id,
        baseItem.source || 'unknown',
        decision,
        JSON.stringify(reasons),
        JSON.stringify({
          title: baseItem.title,
          url: baseItem.url,
          sortScore: baseItem.sortScore || null,
          importance: item.importance || null,
        })
      );
    }
  })(items);
}

function recordSourceRun(source, status, itemCount, errorMessage, meta, config, runTimestamp) {
  const db = getDb(config);
  pruneState(db, config);

  db.prepare(`
    INSERT INTO source_runs (run_timestamp, source, status, item_count, error_message, meta_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    runTimestamp,
    source,
    status,
    itemCount,
    errorMessage || null,
    JSON.stringify(meta || {})
  );
}

function filterNewItems(items, config, logger = console) {
  const db = getDb(config);
  const now = Date.now();
  pruneState(db, config, now);

  const findSeen = db.prepare('SELECT 1 FROM seen_items WHERE item_id = ?');
  const upsertSeen = db.prepare(`
    INSERT INTO seen_items (item_id, seen_at)
    VALUES (?, ?)
    ON CONFLICT(item_id) DO UPDATE SET seen_at = excluded.seen_at
  `);

  const freshItems = [];

  db.transaction(sourceItems => {
    for (const item of sourceItems) {
      if (!findSeen.get(item.id)) {
        freshItems.push(item);
      }

      upsertSeen.run(item.id, now);
    }
  })(items);

  const cachedCount = db.prepare('SELECT COUNT(*) AS count FROM seen_items').get().count;
  logger.info(`[State] ${freshItems.length} new / ${items.length} recent (${cachedCount} seen cached)`);

  return freshItems;
}

function isMaterialUpdate(result, config) {
  const db = getDb(config);
  pruneState(db, config);

  const item = result.item || result;
  const storyKey = item.storyKey || item.url || item.id;
  const existing = db.prepare('SELECT posted_at, payload_json FROM story_memory WHERE story_key = ?').get(storyKey);
  if (!existing) {
    return true;
  }

  try {
    const previous = JSON.parse(existing.payload_json);
    const previousImportance = Number(previous.importance || 0);
    const currentImportance = Number(result.importance || 0);
    const minutesSincePrevious = (Date.now() - Number(existing.posted_at)) / (60 * 1000);
    const summaryChanged = (previous.summary || '') !== (result.summary || '');
    const titleChanged = (previous.title || '') !== (result.title || '');

    if (minutesSincePrevious < config.STORY_UPDATE_MINUTES && currentImportance <= previousImportance && !summaryChanged && !titleChanged) {
      return false;
    }
  } catch {
    return true;
  }

  return true;
}

function filterUnpostedItems(items, config, logger = console) {
  const db = getDb(config);
  pruneState(db, config);

  const findPosted = db.prepare('SELECT 1 FROM posted_items WHERE item_id = ?');
  const unpostedItems = items.filter(item => !findPosted.get(item.item.id) && isMaterialUpdate(item, config));

  if (items.length !== unpostedItems.length) {
    logger.info(`[State] Skipping ${items.length - unpostedItems.length} already-posted or non-material item(s)`);
  }

  return unpostedItems;
}

function markItemsPosted(items, config) {
  if (!items.length) {
    return;
  }

  const db = getDb(config);
  const now = Date.now();
  pruneState(db, config, now);

  const upsertPosted = db.prepare(`
    INSERT INTO posted_items (item_id, posted_at)
    VALUES (?, ?)
    ON CONFLICT(item_id) DO UPDATE SET posted_at = excluded.posted_at
  `);

  db.transaction(postedItems => {
    for (const item of postedItems) {
      upsertPosted.run(item.item.id, now);
    }
  })(items);
}

function recordRun(summary, config) {
  const db = getDb(config);
  pruneState(db, config);

  db.prepare(`
    INSERT INTO runs (timestamp, summary_json)
    VALUES (?, ?)
  `).run(new Date().toISOString(), JSON.stringify(summary));

  pruneState(db, config);
}

function readState(config) {
  const db = getDb(config);
  pruneState(db, config);

  const seenItems = Object.fromEntries(
    db.prepare('SELECT item_id, seen_at FROM seen_items').all().map(row => [row.item_id, row.seen_at])
  );
  const postedItems = Object.fromEntries(
    db.prepare('SELECT item_id, posted_at FROM posted_items').all().map(row => [row.item_id, row.posted_at])
  );
  const runs = db.prepare('SELECT timestamp, summary_json FROM runs ORDER BY id ASC').all().map(row => {
    try {
      return JSON.parse(row.summary_json);
    } catch {
      return { timestamp: row.timestamp };
    }
  });

  return {
    version: STATE_VERSION,
    seenItems,
    postedItems,
    runs,
  };
}

function getRecentSemanticMemory(config) {
  const db = getDb(config);
  pruneState(db, config);

  return db.prepare(`
    SELECT item_id, title, url, content, embedding_json, sent_at
    FROM semantic_memory
    ORDER BY sent_at DESC
  `).all().map(row => ({
    itemId: row.item_id,
    title: row.title,
    url: row.url,
    content: row.content,
    embedding: JSON.parse(row.embedding_json),
    sentAt: row.sent_at,
  }));
}

function getRecentStoryMemory(config) {
  const db = getDb(config);
  pruneState(db, config);

  return db.prepare(`
    SELECT story_key, item_id, title, url, source, domain, fingerprint, first_seen_at, last_seen_at, posted_at, payload_json
    FROM story_memory
    ORDER BY posted_at DESC
  `).all().map(row => ({
    storyKey: row.story_key,
    itemId: row.item_id,
    title: row.title,
    url: row.url,
    source: row.source,
    domain: row.domain,
    fingerprint: row.fingerprint,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    postedAt: row.posted_at,
    payload: JSON.parse(row.payload_json),
  }));
}

function storeSemanticMemory(items, config) {
  if (!items.length) {
    return;
  }

  const db = getDb(config);
  const now = Date.now();
  pruneState(db, config, now);

  const upsertSemantic = db.prepare(`
    INSERT INTO semantic_memory (item_id, title, url, content, embedding_json, sent_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      content = excluded.content,
      embedding_json = excluded.embedding_json,
      sent_at = excluded.sent_at
  `);

  db.transaction(postedItems => {
    for (const result of postedItems) {
      const item = result.item;
      if (!Array.isArray(item.semanticEmbedding) || !item.semanticEmbedding.length) {
        continue;
      }

      upsertSemantic.run(
        item.id,
        item.title || '',
        item.url || '',
        item.semanticText || item.text || item.title || '',
        JSON.stringify(item.semanticEmbedding),
        now
      );
    }
  })(items);
}

function storeStoryMemory(items, config) {
  if (!items.length) {
    return;
  }

  const db = getDb(config);
  const now = Date.now();
  pruneState(db, config, now);

  const upsertStory = db.prepare(`
    INSERT INTO story_memory (story_key, item_id, title, url, source, domain, fingerprint, first_seen_at, last_seen_at, posted_at, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(story_key) DO UPDATE SET
      item_id = excluded.item_id,
      title = excluded.title,
      url = excluded.url,
      source = excluded.source,
      domain = excluded.domain,
      fingerprint = excluded.fingerprint,
      last_seen_at = excluded.last_seen_at,
      posted_at = excluded.posted_at,
      payload_json = excluded.payload_json
  `);

  db.transaction(postedItems => {
    for (const result of postedItems) {
      const item = result.item;
      const storyKey = item.storyKey || item.url || item.id;
      upsertStory.run(
        storyKey,
        item.id,
        item.title || '',
        item.url || '',
        item.source || 'unknown',
        item.quality?.domain || '',
        item.storyFingerprint || item.semanticText || item.title || '',
        now,
        now,
        now,
        JSON.stringify({
          title: result.title,
          summary: result.summary,
          importance: result.importance,
          category: result.category,
        })
      );
    }
  })(items);
}

module.exports = {
  filterNewItems,
  filterUnpostedItems,
  getRecentSemanticMemory,
  getRecentStoryMemory,
  logItemDecisions,
  markItemsPosted,
  readState,
  recordRun,
  recordSourceRun,
  storeSemanticMemory,
  storeStoryMemory,
};
