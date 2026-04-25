require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN.trim());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
const notion = new Client({ auth: process.env.NOTION_TOKEN.trim() });
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID.trim();

const userHistory = {};

async function creerRDV(titre, date, heure, notes) {
  await notion.pages.create({
    parent: { page_id: NOTION_PAGE_ID },
    properties: {
      title: { title: [{ text: { content: titre } }] }
    },
    children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Date: ' + date + ' Heure: ' + heure + ' Notes: ' + notes } }] } }]
  });
}

async function callClaude(userId, message) {
  if (!userHistory[userId]) userHistory[userId] = [];
  userHistory[userId].push({ role: 'user', content: message });
  if (userHistory[userId].length > 20) userHistory[userId] = userHistory[userId].slice(-20);
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: 'Tu es un assistant business pour Kamal. Food truck pizza Bordeaux + pneus. Si BOOST -> plan 24h. Si URGENCE CASH -> actions immediates. Si RDV demande, reponds UNIQUEMENT avec ce format sans emojis: RDV:{"titre":"...","date":"JJ/MM/AAAA","heure":"HH:MM","notes":"..."}',
    messages: userHistory[userId]
  });
  const reply = response.content[0].text;
  userHistory[userId].push({ role: 'assistant', content: reply });
  return reply;
}

function extraireJSON(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin === -1) return null;
  return texte.substring(debut, fin + 1);
}

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const reply = await callClaude(ctx.from.id, ctx.message.text);
    if (reply.includes('RDV:')) {
      const jsonBrut = extraireJSON(reply);
      const rdv = JSON.parse(jsonBrut);
      await creerRDV(rdv.titre, rdv.date, rdv.heure, rdv.notes);
      await ctx.reply('RDV cree dans Notion: ' + rdv.titre + ' le ' + rdv.date + ' a ' + rdv.heure);
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    await ctx.reply('Erreur: ' + err.message);
  }
});

bot.launch();
console.log('Bot started!');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
