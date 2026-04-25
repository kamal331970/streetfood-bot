require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN.trim());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
const userHistory = {};

async function callClaude(userId, message) {
  if (!userHistory[userId]) userHistory[userId] = [];
  userHistory[userId].push({ role: 'user', content: message });
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 1000,
    system: 'Tu es un assistant business pour Kamal. Food truck pizza Bordeaux + pneus. Si BOOST -> plan 24h pour gagner argent. Si URGENCE CASH -> actions immédiates sans budget.',
    messages: userHistory[userId]
  });
  const reply = response.content[0].text;
  userHistory[userId].push({ role: 'assistant', content: reply });
  return reply;
}

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const reply = await callClaude(ctx.from.id, ctx.message.text);
    await ctx.reply(reply);
  } catch (err) {
    await ctx.reply('Erreur: ' + err.message);
  }
});

bot.launch();
console.log('Bot started!');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
