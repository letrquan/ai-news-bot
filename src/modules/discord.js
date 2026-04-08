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

function formatNewsItem(item) {
  const categoryEmoji = {
    Research: '🔬',
    Product: '🚀',
    Industry: '🏢',
    Regulation: '⚖️',
    'Open Source': '🔓',
    Other: '📌',
  };

  const emoji = categoryEmoji[item.category] || '📌';
  const stars = '⭐'.repeat(Math.min(item.importance, 5));
  const engagement = `❤️ ${item.tweet.likes} · 🔁 ${item.tweet.retweets} · 💬 ${item.tweet.replies}`;

  return {
    embed: new MessageEmbed()
      .setColor(item.importance >= 8 ? 0xFF4500 : item.importance >= 6 ? 0xFFA500 : 0x5865F2)
      .setTitle(`${emoji} ${item.title}`)
      .setDescription(item.summary)
      .addField('Source', `[@${item.tweet.author}](https://x.com/${item.tweet.author})`, true)
      .addField('Impact', `${stars} (${item.importance}/10)`, true)
      .addField('Engagement', engagement, true)
      .setURL(item.tweet.url)
      .setTimestamp(new Date(item.tweet.createdAt)),
  };
}

function formatDryRun(items) {
  return items.map((item, index) => ({
    order: index + 1,
    title: item.title,
    importance: item.importance,
    category: item.category,
    author: item.tweet.author,
    url: item.tweet.url,
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

  await channel.send(`🔥 **AI NEWS UPDATE** — ${timestamp} 🔥\n_Found ${itemsToPost.length} important updates from X_\n`);

  for (const item of itemsToPost) {
    try {
      const { embed } = formatNewsItem(item);
      await channel.send({
        content: item.tweet.url,
        embeds: [embed],
      });
      postedItems.push(item);
      await sleep(800);
    } catch (err) {
      logger.error(`[Discord] Failed to send embed item: ${err.message}`);

      try {
        await channel.send(
          `**${item.title}**\n${item.summary}\nSource: ${item.tweet.url}\nImpact: ${item.importance}/10`
        );
        postedItems.push(item);
      } catch (fallbackErr) {
        logger.error(`[Discord] Fallback plain-text send failed: ${fallbackErr.message}`);
      }
    }
  }

  if (postedItems.length > 0) {
    const links = postedItems.map((item, i) =>
      `${i + 1}. [${item.title}](${item.tweet.url})`
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
