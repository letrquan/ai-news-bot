const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function createLogger(level = 'info') {
  const currentLevel = LEVELS[level] ?? LEVELS.info;

  function shouldLog(targetLevel) {
    return LEVELS[targetLevel] <= currentLevel;
  }

  function write(targetLevel, message, meta) {
    if (!shouldLog(targetLevel)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const serializedMeta = meta ? ` ${JSON.stringify(meta)}` : '';
    const line = `${timestamp} ${targetLevel.toUpperCase()} ${message}${serializedMeta}`;

    if (targetLevel === 'error') {
      console.error(line);
      return;
    }

    if (targetLevel === 'warn') {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    error: (message, meta) => write('error', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    info: (message, meta) => write('info', message, meta),
    debug: (message, meta) => write('debug', message, meta),
  };
}

module.exports = { createLogger };
