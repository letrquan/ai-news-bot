const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_STATE_FILE = path.join(__dirname, '..', '..', 'bot-state.db');
const STATE_VERSION = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RUN_HISTORY = 50;

const dbCache = new Map();

function getStateFile(config) {
  return config.STATE_FILE || DEFAULT_STATE_FILE;
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

function pruneState(db, now = Date.now()) {
  const cutoff = now - MAX_AGE_MS;
  db.prepare('DELETE FROM seen_items WHERE seen_at < ?').run(cutoff);
  db.prepare('DELETE FROM posted_items WHERE posted_at < ?').run(cutoff);

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
}

function filterNewItems(items, config, logger = console) {
  const db = getDb(config);
  const now = Date.now();
  pruneState(db, now);

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

function filterUnpostedItems(items, config, logger = console) {
  const db = getDb(config);
  pruneState(db);

  const findPosted = db.prepare('SELECT 1 FROM posted_items WHERE item_id = ?');
  const unpostedItems = items.filter(item => !findPosted.get(item.item.id));

  if (items.length !== unpostedItems.length) {
    logger.info(`[State] Skipping ${items.length - unpostedItems.length} already-posted item(s)`);
  }

  return unpostedItems;
}

function markItemsPosted(items, config) {
  if (!items.length) {
    return;
  }

  const db = getDb(config);
  const now = Date.now();
  pruneState(db, now);

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
  pruneState(db);

  db.prepare(`
    INSERT INTO runs (timestamp, summary_json)
    VALUES (?, ?)
  `).run(new Date().toISOString(), JSON.stringify(summary));

  pruneState(db);
}

function readState(config) {
  const db = getDb(config);
  pruneState(db);

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

module.exports = {
  filterNewItems,
  filterUnpostedItems,
  markItemsPosted,
  readState,
  recordRun,
};
