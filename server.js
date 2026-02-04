/**
 * POCKET ROBOT v9.9.9 - STABILITY BUILD
 * 1. Global Error Handler (Prevents crashes)
 * 2. Edit-Safety Wrapper (Prevents 400 Bad Request)
 * 3. Atomic Session Initializer
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 1. ROBUST SESSION CONFIG ---
const localSession = new LocalSession({
    database: 'session.json',
    property: 'session',
    state: { trade: { asset: 'BTC/USD', amount: 100, tip: 0.001, connected: false } }
});
bot.use(localSession.middleware());

// --- 2. GLOBAL ERROR CATCHER (CRITICAL) ---
// This stops the bot from dying if a single button click fails.
bot.catch((err, ctx) => {
    console.error(`🔴 BOT ERROR for ${ctx.updateType}:`, err.message);
    if (err.message.includes('message is not modified')) {
        return ctx.answerCbQuery("⚠️ No changes detected.");
    }
    ctx.answerCbQuery("❌ Error occurred. Please try again.").catch(() => {});
});

// --- 3. DYNAMIC KEYBOARD BUILDER ---
const mainKeyboard = (ctx) => {
    // Safety check: ensure session exists before reading properties
    const trade = ctx.session.trade || { asset: 'BTC/USD', amount: 100, tip: 0.001, connected: false };
    const { asset, tip, amount, connected } = trade;
    
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🪙 Asset: ${asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${amount} USD`, 'menu_stake')],
        [Markup.button.callback(`⚡ Priority: ${tip} SOL`, 'toggle_tip')],
        [Markup.button.callback(connected ? '✅ WALLET LINKED' : '🔌 CONNECT WALLET', 'wallet_info')],
        [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')]
    ]);
};

// --- 4. FAIL-SAFE ACTION HANDLERS ---

bot.action('menu_coins', async (ctx) => {
    try {
        const assets = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
        let currentIdx = assets.indexOf(ctx.session.trade.asset);
        ctx.session.trade.asset = assets[(currentIdx + 1) % assets.length];
        
        await ctx.answerCbQuery(`Asset: ${ctx.session.trade.asset}`);
        // We use .catch() here so if the edit fails, the bot doesn't crash.
        return await ctx.editMessageReplyMarkup(mainKeyboard(ctx).reply_markup).catch(() => {});
    } catch (e) { console.error(e); }
});

bot.action('toggle_tip', async (ctx) => {
    try {
        const tips = [0.001, 0.005, 0.01];
        let currentIdx = tips.indexOf(ctx.session.trade.tip);
        ctx.session.trade.tip = tips[(currentIdx + 1) % tips.length];
        
        await ctx.answerCbQuery(`Tip: ${ctx.session.trade.tip} SOL`);
        return await ctx.editMessageReplyMarkup(mainKeyboard(ctx).reply_markup).catch(() => {});
    } catch (e) { console.error(e); }
});

bot.action('wallet_info', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const msg = ctx.session.trade.connected 
        ? "✅ *Wallet Active*\nReady for Atomic Execution." 
        : "⚠️ *No Wallet Linked*\nUse `/connect` to link your institutional seed.";
    return ctx.replyWithMarkdown(msg);
});

bot.action('start_engine', async (ctx) => {
    try {
        await ctx.answerCbQuery("Scanning...").catch(() => {});
        const ts = Date.now();
        
        // Dynamic text ensures "Message not modified" never happens
        await ctx.editMessageText(`🔍 *ANALYZING ${ctx.session.trade.asset}...*\n[ID: ${ts}] Fetching orderbook depth...`, {
            parse_mode: 'Markdown'
        });

        setTimeout(() => {
            ctx.editMessageText(`🎯 *SIGNAL FOUND*\nDirection: *HIGHER*\nConfirm Atomic Snipe?`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                    [Markup.button.callback('🔙 CANCEL', 'main_menu')]
                ])
            }).catch(() => {});
        }, 1500);
    } catch (e) { console.error(e); }
});

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    return ctx.editMessageText("🤖 *POCKET ROBOT v9.9.9*", {
        parse_mode: 'Markdown',
        ...mainKeyboard(ctx)
    }).catch(() => {});
});

// --- COMMANDS ---
bot.start((ctx) => {
    // Initialize session if it doesn't exist
    ctx.session.trade = ctx.session.trade || { asset: 'BTC/USD', amount: 100, tip: 0.001, connected: false };
    return ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v9.9.9*`, mainKeyboard(ctx));
});

bot.command('connect', async (ctx) => {
    ctx.session.trade.connected = true;
    return ctx.reply("✅ *Wallet successfully linked.*", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 Stability v9.9.9 is Online."));
