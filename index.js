require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const Anthropic = require('@anthropic-ai/sdk');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Historique par utilisateur
const userHistory = {};

const SYSTEM_PROMPT = `Tu es un assistant bot Telegram personnel pour Kamal Arafa.
Kamal est restaurateur (food truck pizza à Ibis Budget Bordeaux Lormont) + commercial pneus.
Objectif : +500 à +1000€/mois rapidement.

Outils disponibles (simule les résultats de façon réaliste) :
- [GMAIL] : lire emails non lus, résumer threads, envoyer email, archiver, créer brouillon
- [NOTION] : créer page/tâche, rechercher note, résumer, mettre à jour statut
- [CALENDAR] : lire agenda du jour/semaine, créer/modifier événement
- [OUTLOOK] : mêmes fonctions que Gmail

RÈGLES :
- Utilise des emojis pour rendre les réponses lisibles 📧 📝 📅
- Max 5-8 lignes par réponse
- Indique toujours quel outil tu utilises : [GMAIL], [NOTION], [CALENDAR]
- Pour actions irréversibles → demande confirmation explicite
- Si "BOOST" → plan pour faire de l'argent en 24h max (food truck + pneus)
- Si "URGENCE CASH" → actions immédiates sans budget, résultat le jour même
- Format réponse Telegram : texte simple, pas de markdown complexe
- Propose toujours 2-3 actions suivantes`;

async function callClaude(userId, message) {
  if (!userHistory[userId]) userHistory[userId] = [];
  
  userHistory[userId].push({ role: 'user', content: message });
  
  // Garde max 20 messages en historique
  if (userHistory[userId].length > 20) {
    userHistory[userId] = userHistory[userId].slice(-20);
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: userHistory[userId]
  });

  const reply = response.content[0].text;
  userHistory[userId].push({ role: 'assistant', content: reply });
  return reply;
}

// /start
bot.start((ctx) => {
  const welcome = `👋 Bonjour Kamal ! Je suis ton assistant personnel connecté à :

📧 Gmail & Outlook
📝 Notion  
📅 Google Calendar

Dis-moi ce que tu veux faire en langage naturel !`;

  ctx.reply(welcome, Markup.keyboard([
    ['📧 Emails non lus', '📅 Agenda semaine'],
    ['📝 Créer tâche Notion', '💰 BOOST'],
    ['🚨 URGENCE CASH', '❓ Aide']
  ]).resize());
});

// /help
bot.help((ctx) => {
  ctx.reply(`📋 Commandes disponibles :

📧 Emails non lus → résumé Gmail
📅 Agenda semaine → Google Calendar
📝 Créer tâche Notion → nouvelle entrée
💰 BOOST → plan argent en 24h
🚨 URGENCE CASH → actions immédiates
❓ Aide → ce message

Ou écris n'importe quoi en langage naturel !`);
});

// /reset - réinitialise l'historique
bot.command('reset', (ctx) => {
  userHistory[ctx.from.id] = [];
  ctx.reply('🔄 Historique effacé. Nouvelle conversation !');
});

// Raccourcis clavier
bot.hears('📧 Emails non lus', async (ctx) => {
  await handleMessage(ctx, 'Quels sont mes emails non lus importants ?');
});
bot.hears('📅 Agenda semaine', async (ctx) => {
  await handleMessage(ctx, "C'est quoi mon agenda pour cette semaine ?");
});
bot.hears('📝 Créer tâche Notion', async (ctx) => {
  await handleMessage(ctx, 'Crée une nouvelle tâche dans Notion');
});
bot.hears('💰 BOOST', async (ctx) => {
  await handleMessage(ctx, 'BOOST');
});
bot.hears('🚨 URGENCE CASH', async (ctx) => {
  await handleMessage(ctx, 'URGENCE CASH');
});
bot.hears('❓ Aide', (ctx) => ctx.reply('/help'));

// Message texte générique
async function handleMessage(ctx, text) {
  const typing = ctx.sendChatAction('typing');
  try {
    await typing;
    const reply = await callClaude(ctx.from.id, text);
    await ctx.reply(reply);
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Erreur. Réessaie dans quelques secondes.');
  }
}

bot.on('text', async (ctx) => {
  await handleMessage(ctx, ctx.message.text);
});

// Lancement
bot.launch();
console.log('🤖 Bot démarré !');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
