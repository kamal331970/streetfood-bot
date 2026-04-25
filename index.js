require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN.trim());
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() });
const notion = new Client({ auth: process.env.NOTION_TOKEN.trim() });
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID.trim();
const CHAT_ID = process.env.TELEGRAM_CHAT_ID.trim();

const userHistory = {};

async function creerRDV(titre, date, heure, notes) {
  await notion.pages.create({
    parent: { page_id: NOTION_PAGE_ID },
    properties: { title: { title: [{ text: { content: 'RDV: ' + titre } }] } },
    children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Date: ' + date + ' Heure: ' + heure + ' Notes: ' + notes } }] } }]
  });
}

async function creerTache(titre, priorite) {
  await notion.pages.create({
    parent: { page_id: NOTION_PAGE_ID },
    properties: { title: { title: [{ text: { content: 'TACHE: ' + titre } }] } },
    children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Priorite: ' + priorite + ' | Statut: A faire' } }] } }]
  });
}

async function envoyerRappels() {
  try {
    const response = await notion.blocks.children.list({ block_id: NOTION_PAGE_ID });
    const aujourd_hui = new Date().toLocaleDateString('fr-FR');
    const demain = new Date(Date.now() + 86400000).toLocaleDateString('fr-FR');
    let message = 'Bonjour Kamal! Rappels du jour:\n\n';
    let count = 0;
    for (const block of response.results) {
      if (block.type === 'child_page') {
        const page = await notion.pages.retrieve({ page_id: block.id });
        const titre = page.properties.title?.title[0]?.plain_text || '';
        const contenu = await notion.blocks.children.list({ block_id: block.id });
        for (const b of contenu.results) {
          if (b.type === 'paragraph') {
            const texte = b.paragraph.rich_text[0]?.plain_text || '';
            if (texte.includes(aujourd_hui) || texte.includes(demain) || titre.includes('TACHE')) {
              message += '- ' + titre + '\n' + texte + '\n\n';
              count++;
            }
          }
        }
      }
    }
    if (count > 0) {
      await bot.telegram.sendMessage(CHAT_ID, message);
    } else {
      await bot.telegram.sendMessage(CHAT_ID, 'Bonjour Kamal! Aucun RDV ni tache aujourd\'hui.');
    }
  } catch (err) {
    console.error('Erreur rappels:', err.message);
  }
}

function demarrerRappels() {
  const maintenant = new Date();
  const prochaine8h = new Date();
  prochaine8h.setHours(8, 0, 0, 0);
  if (maintenant >= prochaine8h) prochaine8h.setDate(prochaine8h.getDate() + 1);
  const delai = prochaine8h - maintenant;
  setTimeout(() => {
    envoyerRappels();
    setInterval(envoyerRappels, 24 * 60 * 60 * 1000);
  }, delai);
}

async function callClaude(userId, message) {
  if (!userHistory[userId]) userHistory[userId] = [];
  userHistory[userId].push({ role: 'user', content: message });
  if (userHistory[userId].length > 20) userHistory[userId] = userHistory[userId].slice(-20);
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: 'Tu es un assistant business pour Kamal. Food truck pizza Bordeaux + pneus. Si BOOST -> plan 24h. Si URGENCE CASH -> actions immediates. Si RDV demande -> reponds: RDV:{"titre":"...","date":"JJ/MM/AAAA","heure":"HH:MM","notes":"..."}. Si tache demandee -> reponds: TACHE:{"titre":"...","priorite":"haute/normale/basse"}',
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
      const rdv = JSON.parse(extraireJSON(reply));
      await creerRDV(rdv.titre, rdv.date, rdv.heure, rdv.notes);
      await ctx.reply('RDV cree: ' + rdv.titre + ' le ' + rdv.date + ' a ' + rdv.heure);
    } else if (reply.includes('TACHE:')) {
      const tache = JSON.parse(extraireJSON(reply));
      await creerTache(tache.titre, tache.priorite);
      await ctx.reply('Tache creee dans Notion: ' + tache.titre + ' (priorite: ' + tache.priorite + ')');
    } else {
      await ctx.reply(reply);
    }
  } catch (err) {
    await ctx.reply('Erreur: ' + err.message);
  }
});

bot.launch();
demarrerRappels();
console.log('Bot started!');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
