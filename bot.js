require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');
// Add other required imports like Solana connection, Keypair etc.

if (!process.env.BOT_TOKEN) {
    console.error("❌ BOT_TOKEN missing!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. FIX: Proper Session Persistence
// This saves settings to session.json so buttons stay in sync
const localSession = new LocalSession({ database: 'session.json' });
bot.use(localSession.middleware());

// --- Initial State Helper ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD',
        payout: 94,
        amount: 1,
        autoPilot: false,
        lastSignal: 'None'
    };
    return next();
});

// --- UI Layout ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`💵 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(ctx.session.trade.autoPilot ? '🛑 STOP AUTO-PILOT' : '🤖 START AUTO-PILOT', 'toggle_autopilot')],
    [Markup.button.callback('📡 REFRESH STATUS', 'main_menu')]
]);

// --- Core Actions ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(`⚡️ *POCKET ROBOT v9.2* ⚡️\nStatus: *Online*`, mainKeyboard(ctx));
});

// FIX: Handle button clicks properly with answerCbQuery (prevents "loading" clock icon)
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`⚙️ *DASHBOARD*\nLast Signal: _${ctx.session.trade.lastSignal}_`, { 
        parse_mode: 'Markdown', 
        ...mainKeyboard(ctx) 
    });
});

bot.action('toggle_autopilot', async (ctx) => {
    ctx.session.trade.autoPilot = !ctx.session.trade.autoPilot;
    const status = ctx.session.trade.autoPilot ? "ENABLED ✅" : "DISABLED 🛑";
    
    await ctx.answerCbQuery(`Auto-Pilot ${status}`);
    await ctx.editMessageText(`🤖 *Auto-Pilot:* ${status}\nSearching for high-confidence signals...`, {
        parse_mode: 'Markdown',
        ...mainKeyboard(ctx)
    });

    if (ctx.session.trade.autoPilot) {
        startGlobalMonitoring(ctx);
    }
});

// --- THE 24/7 MONITORING ENGINE ---
// Use a Map to keep track of intervals per user so they don't overlap
const activeIntervals = new Map();

function startGlobalMonitoring(ctx) {
    const chatId = ctx.chat.id;
    
    // Clear existing interval if any to avoid double-running
    if (activeIntervals.has(chatId)) {
        clearInterval(activeIntervals.get(chatId));
    }

    const intervalId = setInterval(async () => {
        // If user turned it off, stop the interval
        if (!ctx.session.trade.autoPilot) {
            clearInterval(intervalId);
            activeIntervals.delete(chatId);
            return;
        }

        try {
            // Logic to find signals (LunarCrush, Telegram Scrapers, etc.)
            // Example: const signal = await findBestSignal();
            console.log(`[24/7] Monitoring signals for ${chatId}...`);
            
            // If a 90%+ signal is found, execute and notify
            // ctx.replyWithMarkdown(`🔥 *SIGNAL FOUND*...`);
        } catch (e) {
            console.error("Monitoring Error:", e.message);
        }
    }, 10000); // 10-second pulse check

    activeIntervals.set(chatId, intervalId);
}

bot.launch().then(() => console.log("🚀 Bot is live and buttons are active."));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
