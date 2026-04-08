const fs = require('fs');
const path = require('path');

const DEFAULT_STATE_FILE = path.join(__dirname, '..', '..', 'bot-state.json');
const STATE_VERSION = 2;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RUN_HISTORY = 50;

function getStateFile(config) {
  return config.STATE_FILE || DEFAULT_STATE_FILE;
}

function createEmptyState() {
  return {
    version: STATE_VERSION,
    seenItems: {},
    postedItems: {},
    runs: [],
  };
}

function readState(config) {
  const stateFile = getStateFile(config);

  try {
    if (!fs.existsSync(stateFile)) {
      return createEmptyState();
    }

    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);

    return {
      ...createEmptyState(),
      ...parsed,
      seenItems: parsed.seenItems || parsed.seenTweets || {},
      postedItems: parsed.postedItems || parsed.postedTweets || {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch (err) {
    console.error(`[State] Failed to read ${stateFile}: ${err.message}`);
    return createEmptyState();
  }
}

function writeState(config, state) {
  const stateFile = getStateFile(config);
  const tempFile = `${stateFile}.tmp`;

  try {
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
    fs.renameSync(tempFile, stateFile);
  } catch (err) {
    console.error(`[State] Failed to write ${stateFile}: ${err.message}`);
  }
}

function pruneState(state, now = Date.now()) {
  for (const [id, timestamp] of Object.entries(state.seenItems)) {
    if (now - timestamp > MAX_AGE_MS) {
      delete state.seenItems[id];
    }
  }

  for (const [id, timestamp] of Object.entries(state.postedItems)) {
    if (now - timestamp > MAX_AGE_MS) {
      delete state.postedItems[id];
    }
  }

  state.runs = state.runs.slice(-MAX_RUN_HISTORY);
  return state;
}

function filterNewItems(items, config, logger = console) {
  const state = pruneState(readState(config));
  const now = Date.now();
  const freshItems = items.filter(item => !state.seenItems[item.id]);

  for (const item of items) {
    state.seenItems[item.id] = now;
  }

  writeState(config, state);
  logger.info(`[State] ${freshItems.length} new / ${items.length} recent (${Object.keys(state.seenItems).length} seen cached)`);

  return freshItems;
}

function filterUnpostedItems(items, config, logger = console) {
  const state = pruneState(readState(config));
  const unpostedItems = items.filter(item => !state.postedItems[item.item.id]);

  if (items.length !== unpostedItems.length) {
    logger.info(`[State] Skipping ${items.length - unpostedItems.length} already-posted item(s)`);
  }

  return unpostedItems;
}

function markItemsPosted(items, config) {
  if (!items.length) {
    return;
  }

  const state = pruneState(readState(config));
  const now = Date.now();

  for (const item of items) {
    state.postedItems[item.item.id] = now;
  }

  writeState(config, state);
}

function recordRun(summary, config) {
  const state = pruneState(readState(config));
  state.runs.push({
    ...summary,
    timestamp: new Date().toISOString(),
  });
  writeState(config, state);
}

module.exports = {
  filterNewItems,
  filterUnpostedItems,
  markItemsPosted,
  readState,
  recordRun,
};
