require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');
const { Connection, Keypair, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const bs58 = require('bs58');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- 1. INITIALIZATION & SAFETY ---
if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Persistence for user settings
const localSession = new LocalSession({ 
    database: 'session.json',
    property: 'session',
    storage: LocalSession.storageFileAsync,
    format: {
        serialize: (obj) => JSON.stringify(obj, null, 2),
        deserialize: (str) => JSON.parse(str),
    }
});
bot.use(localSession.middleware());

// --- 2. SESSION INITIALIZER (CRITICAL FIX) ---
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD',
        payout: 94,
        amount: 1,
        autoPilot: false,
        mode: 'Real'
    };
    return next();
});

// --- 3. KEYBOARDS ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`🚀 Leverage: 10x ATOMIC`, 'leverage_info')],
    [Markup.button.callback(`💵 Stake: ${ctx.session.trade.amount} SOL`, 'menu_stake')],
    [Markup.button.callback(ctx.session.trade.autoPilot ? '🛑 STOP AUTO-PILOT' : '🤖 START AUTO-PILOT', 'toggle_autopilot')],
    [Markup.button.callback('🕹 MANUAL MODE', 'manual_menu')]
]);

// --- 4. COMMANDS & ACTIONS ---

// START command
bot.start((ctx) => {
    return ctx.replyWithMarkdown(
        `⚡️ *POCKET ROBOT v10.2 - APEX PRO* ⚡️\n\n` +
        `Institutional 10x Flash Loan Engine active.\n` +
        `Current Prediction: *Checking...*`,
        mainKeyboard(ctx)
    );
});

// Responds to manual menu
bot.action('manual_menu', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(`🕹 *MANUAL EXECUTION*\nSelect your prediction direction:`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('📈 HIGHER', 'exec_up'), Markup.button.callback('📉 LOWER', 'exec_down')],
            [Markup.button.callback('⬅️ BACK', 'main_menu')]
        ])
    );
});

// Main menu back button
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(`⚡️ *POCKET ROBOT DASHBOARD*`, mainKeyboard(ctx));
});

// Toggle Autopilot
bot.action('toggle_autopilot', async (ctx) => {
    ctx.session.trade.autoPilot = !ctx.session.trade.autoPilot;
    const status = ctx.session.trade.autoPilot ? "ENABLED ✅" : "DISABLED 🛑";
    
    await ctx.answerCbQuery(`Auto-Pilot ${status}`);
    return ctx.editMessageText(`🤖 *Auto-Pilot Status:* ${status}\nRunning 24/7 signal analysis every 5s...`, mainKeyboard(ctx));
});

// Dummy action for Leverage info
bot.action('leverage_info', (ctx) => ctx.answerCbQuery("10x Atomic Flash Loans Enabled", { show_alert: true }));

// --- 5. LAUNCH ---
bot.launch().then(() => console.log("🚀 Pocket Robot is Live & Responsive!"));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
