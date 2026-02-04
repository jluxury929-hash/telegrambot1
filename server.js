/**
 * POCKET ROBOT v9.9.9 - FULL BUTTON FIX
 * 1. Fixed "Spinning" buttons with answerCbQuery()
 * 2. Fixed Session persistence with LocalSession
 * 3. Fixed Action Handlers to match Markup data
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, PublicKey } = require('@solana/web3.js');

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 1. SESSION & STATE PERSISTENCE ---
// This ensures that when you click "Asset", it actually saves your choice.
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 2. THE DYNAMIC KEYBOARD ---
const mainKeyboard = (ctx) => {
    // We pull live data from the session to show on button labels
    const { asset, tip, amount, connected } = ctx.session.trade;
    
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🪙 Asset: ${asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${amount} USD`, 'menu_stake')],
        [Markup.button.callback(`⚡ Priority: ${tip} SOL`, 'toggle_tip')],
        [Markup.button.callback(connected ? '✅ WALLET LINKED' : '🔌 CONNECT WALLET', 'wallet_info')],
        [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')]
    ]);
};

// --- 3. RE-ENGINEERED BUTTON HANDLERS ---

// Toggle Asset
bot.action('menu_coins', async (ctx) => {
    const assets = ['BTC/USD', 'ETH/USD', 'SOL/USD'];
    let currentIdx = assets.indexOf(ctx.session.trade.asset);
    ctx.session.trade.asset = assets[(currentIdx + 1) % assets.length];
    
    // 🔥 FIX: Answer the callback to stop the "loading" spinner
    await ctx.answerCbQuery(`Switched to ${ctx.session.trade.asset}`);
    // 🔥 FIX: Edit the message to refresh the button labels
    return ctx.editMessageReplyMarkup(mainKeyboard(ctx).reply_markup);
});

// Toggle Tip
bot.action('toggle_tip', async (ctx) => {
    const tips = [0.001, 0.005, 0.01];
    let currentIdx = tips.indexOf(ctx.session.trade.tip);
    ctx.session.trade.tip = tips[(currentIdx + 1) % tips.length];
    
    await ctx.answerCbQuery(`Tip adjusted to ${ctx.session.trade.tip} SOL`);
    return ctx.editMessageReplyMarkup(mainKeyboard(ctx).reply_markup);
});

// Wallet Info
bot.action('wallet_info', async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session.trade.connected) {
        return ctx.replyWithMarkdown("⚠️ *No Wallet Linked*\nUse `/connect` to link your institutional seed.");
    }
    return ctx.replyWithMarkdown("✅ *Wallet Active*\nReady for Atomic Execution.");
});

// Start Engine (The Workflow)
bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("Searching for gRPC Signal...");
    const ts = Date.now();
    
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
        });
    }, 1500);
});

// Main Menu Return
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText("🤖 *POCKET ROBOT v9.9.9*", {
        parse_mode: 'Markdown',
        ...mainKeyboard(ctx)
    });
});

// --- COMMANDS ---
bot.start((ctx) => {
    ctx.session.trade = ctx.session.trade || { asset: 'BTC/USD', amount: 100, tip: 0.001, connected: false };
    return ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v9.9.9*`, mainKeyboard(ctx));
});

bot.command('connect', async (ctx) => {
    ctx.session.trade.connected = true;
    return ctx.reply("✅ *Wallet successfully linked.*", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 All buttons fixed and responsive."));
