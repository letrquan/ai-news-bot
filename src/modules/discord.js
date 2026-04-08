const { Client, Intents, MessageEmbed } = require('discord.js-selfbot-v13');
const config = require('../config');

let client = null;

async function init() {
  client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

  client.on('ready', () => {
    console.log(`[Discord] Logged in as ${client.user.tag}`);
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

async function sendNewsUpdate(items) {
  if (!client) throw new Error('Discord client not initialized');

  const channel = await client.channels.fetch(config.DISCORD_CHANNEL_ID);
  if (!channel) throw new Error(`Channel ${config.DISCORD_CHANNEL_ID} not found`);

  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  await channel.send(`🔥 **AI NEWS UPDATE** — ${timestamp} 🔥\n_Found ${items.length} important updates from X_\n`);

  for (const item of items.slice(0, 10)) {
    try {
      const { embed } = formatNewsItem(item);
      await channel.send({ embeds: [embed] });
      await sleep(800);
    } catch (err) {
      console.error(`[Discord] Failed to send item: ${err.message}`);
    }
  }

  if (items.length > 0) {
    const links = items.slice(0, 10).map((item, i) =>
      `${i + 1}. [${item.title}](${item.tweet.url})`
    ).join('\n');
    await channel.send(`📋 **Quick Links:**\n${links}`);
  }
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
