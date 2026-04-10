const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const SECRET_PATTERNS = [
  /(https?:\/\/[^\s]*discord(?:app)?\.com\/api\/webhooks\/)[^\s]+/gi,
  /(auth_token=)[^;\s]+/gi,
  /(ct0=)[^;\s]+/gi,
  /("?(?:apiKey|api_key|token|authorization|cookie|webhook_url|discord_webhook_url|openai_api_key|x_auth_token|x_ct0)"?\s*[:=]\s*")([^"]+)(")/gi,
];

function redactSecrets(value) {
  let output = String(value ?? '');

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (...args) => {
      if (args.length >= 4 && args[3] === '"') {
        return `${args[1]}[REDACTED]${args[3]}`;
      }

      return `${args[1] || ''}[REDACTED]`;
    });
  }

  return output;
}

function sanitizeMeta(meta) {
  if (meta == null) {
    return meta;
  }

  try {
    return JSON.parse(redactSecrets(JSON.stringify(meta)));
  } catch {
    return redactSecrets(String(meta));
  }
}

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
    const safeMessage = redactSecrets(message);
    const safeMeta = sanitizeMeta(meta);
    const serializedMeta = safeMeta ? ` ${JSON.stringify(safeMeta)}` : '';
    const line = `${timestamp} ${targetLevel.toUpperCase()} ${safeMessage}${serializedMeta}`;

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

module.exports = { createLogger, redactSecrets };
