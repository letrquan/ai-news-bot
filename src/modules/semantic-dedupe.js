const OpenAI = require('openai');
const config = require('../config');
const { getRecentSemanticMemory } = require('../utils/cache');

let warnedDisabled = false;

function shouldUseDedicatedEmbeddingKey() {
  const baseUrl = (config.OPENAI_BASE_URL || '').toLowerCase();
  return baseUrl.includes('api.z.ai');
}

function getEmbeddingClient() {
  const apiKey = config.OPENAI_EMBEDDING_API_KEY
    || (!shouldUseDedicatedEmbeddingKey() ? config.OPENAI_API_KEY : undefined);

  if (!config.SEMANTIC_DEDUPE_ENABLED || !apiKey) {
    return null;
  }

  const options = {
    apiKey,
  };

  if (config.OPENAI_EMBEDDING_BASE_URL) {
    options.baseURL = config.OPENAI_EMBEDDING_BASE_URL;
  }

  return new OpenAI(options);
}

function normalizeSemanticText(item) {
  return [
    item.sourceLabel,
    item.title,
    item.author,
    item.text,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, config.SEMANTIC_EMBEDDING_MAX_CHARS);
}

function dot(a, b) {
  let total = 0;

  for (let i = 0; i < a.length; i += 1) {
    total += a[i] * b[i];
  }

  return total;
}

function magnitude(vector) {
  return Math.sqrt(dot(vector, vector));
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }

  const denominator = magnitude(a) * magnitude(b);
  if (!denominator) {
    return 0;
  }

  return dot(a, b) / denominator;
}

async function embedTexts(client, texts) {
  const embeddings = [];

  for (let index = 0; index < texts.length; index += config.SEMANTIC_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + config.SEMANTIC_EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: config.OPENAI_EMBEDDING_MODEL,
      input: batch,
    });

    embeddings.push(...response.data.map(item => item.embedding));
  }

  return embeddings;
}

async function filterSemanticDuplicates(items, logger = console) {
  const client = getEmbeddingClient();
  if (!client) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      logger.warn('[SemanticDedupe] Disabled: set OPENAI_EMBEDDING_API_KEY for text-embedding-3-small semantic dedupe');
    }

    return {
      items,
      skipped: 0,
    };
  }

  if (!items.length) {
    return { items: [], skipped: 0 };
  }

  const recentMemory = getRecentSemanticMemory(config);
  const texts = items.map(normalizeSemanticText);
  const embeddings = await embedTexts(client, texts);

  const acceptedItems = [];
  const acceptedEmbeddings = [];
  let skipped = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const embedding = embeddings[index];
    const text = texts[index];

    let maxSimilarity = 0;

    for (const memory of recentMemory) {
      maxSimilarity = Math.max(maxSimilarity, cosineSimilarity(embedding, memory.embedding));
      if (maxSimilarity > config.SEMANTIC_SIMILARITY_THRESHOLD) {
        break;
      }
    }

    if (maxSimilarity <= config.SEMANTIC_SIMILARITY_THRESHOLD) {
      for (const acceptedEmbedding of acceptedEmbeddings) {
        maxSimilarity = Math.max(maxSimilarity, cosineSimilarity(embedding, acceptedEmbedding));
        if (maxSimilarity > config.SEMANTIC_SIMILARITY_THRESHOLD) {
          break;
        }
      }
    }

    if (maxSimilarity > config.SEMANTIC_SIMILARITY_THRESHOLD) {
      skipped += 1;
      logger.info('[SemanticDedupe] Skipping semantically similar item', {
        itemId: item.id,
        similarity: Number(maxSimilarity.toFixed(3)),
        title: item.title,
      });
      continue;
    }

    item.semanticText = text;
    item.semanticEmbedding = embedding;
    acceptedItems.push(item);
    acceptedEmbeddings.push(embedding);
  }

  logger.info('[SemanticDedupe] Completed semantic filtering', {
    input: items.length,
    kept: acceptedItems.length,
    skipped,
    threshold: config.SEMANTIC_SIMILARITY_THRESHOLD,
  });

  return {
    items: acceptedItems,
    skipped,
  };
}

module.exports = {
  filterSemanticDuplicates,
};
