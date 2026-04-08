const { Client, Intents, MessageEmbed } = require('discord.js-selfbot-v13');
const config = require('../config');

let client = null;

async function init(logger = console) {
  if (config.DRY_RUN) {
    logger.info('[Discord] DRY_RUN enabled, skipping Discord login');
    return null;
  }

  client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

  client.on('ready', () => {
    logger.info(`[Discord] Logged in as ${client.user.tag}`);
  });

  await client.login(config.DISCORD_TOKEN);
  return client;
}

function formatMetrics(item) {
  const metrics = [];

  if (item.score) metrics.push(`⬆️ ${item.score}`);
  if (item.comments) metrics.push(`💬 ${item.comments}`);
  if (item.reactions) metrics.push(`🔁 ${item.reactions}`);
  if (item.views) metrics.push(`👀 ${item.views}`);

  return metrics.join(' · ') || 'n/a';
}

function formatNewsItem(result) {
  const item = result.item;
  const categoryEmoji = {
    Research: '🔬',
    Product: '🚀',
    Industry: '🏢',
    Regulation: '⚖️',
    'Open Source': '🔓',
    Other: '📌',
  };

  const emoji = categoryEmoji[result.category] || '📌';
  const stars = '⭐'.repeat(Math.min(result.importance, 5));

  return {
    embed: new MessageEmbed()
      .setColor(result.importance >= 8 ? 0xFF4500 : result.importance >= 6 ? 0xFFA500 : 0x5865F2)
      .setTitle(`${emoji} ${result.title}`)
      .setDescription(result.summary)
      .addField('Source', `${item.sourceLabel} · ${item.author}`, true)
      .addField('Impact', `${stars} (${result.importance}/10)`, true)
      .addField('Signals', formatMetrics(item), true)
      .setURL(item.url)
      .setTimestamp(new Date(item.createdAt)),
  };
}

function formatDryRun(items) {
  return items.map((result, index) => ({
    order: index + 1,
    title: result.title,
    importance: result.importance,
    category: result.category,
    source: result.item.sourceLabel,
    author: result.item.author,
    url: result.item.url,
  }));
}

async function sendNewsUpdate(items, logger = console) {
  if (config.DRY_RUN) {
    logger.info('[Discord] DRY_RUN payload ready', {
      count: items.length,
      items: formatDryRun(items),
    });
    return items.slice(0, config.MAX_POSTS_PER_RUN);
  }

  if (!client) throw new Error('Discord client not initialized');

  const channel = await client.channels.fetch(config.DISCORD_CHANNEL_ID);
  if (!channel) throw new Error(`Channel ${config.DISCORD_CHANNEL_ID} not found`);

  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: config.TIMEZONE });
  const postedItems = [];
  const itemsToPost = items.slice(0, config.MAX_POSTS_PER_RUN);

  await channel.send(`🔥 **AI NEWS UPDATE** — ${timestamp} 🔥\n_Found ${itemsToPost.length} important updates across ${config.ENABLED_SOURCES.join(', ')}_\n`);

  for (const result of itemsToPost) {
    try {
      const { embed } = formatNewsItem(result);
      await channel.send({
        content: result.item.url,
        embeds: [embed],
      });
      postedItems.push(result);
      await sleep(800);
    } catch (err) {
      logger.error(`[Discord] Failed to send embed item: ${err.message}`);

      try {
        await channel.send(
          `**${result.title}**\n${result.summary}\nSource: ${result.item.sourceLabel} · ${result.item.url}\nImpact: ${result.importance}/10`
        );
        postedItems.push(result);
      } catch (fallbackErr) {
        logger.error(`[Discord] Fallback plain-text send failed: ${fallbackErr.message}`);
      }
    }
  }

  if (postedItems.length > 0) {
    const links = postedItems.map((result, index) =>
      `${index + 1}. [${result.title}](${result.item.url})`
    ).join('\n');
    await channel.send(`📋 **Quick Links:**\n${links}`);
  }

  return postedItems;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function destroy() {
  if (client) {
    await client.destroy();
    client = null;
    console.log('[Discord] Disconnected');
  }
}

module.exports = { init, sendNewsUpdate, destroy };
