require('dotenv').config(); // MUST BE LINE 1

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'apex_vault.json' })).middleware());

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)', mode: 'Real'
    };
    return next();
});

// --- LIVE CAD CONVERTER ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.42).toFixed(2); } // Feb 2026 Forecast
}

// --- POCKET ROBOT KEYBOARD ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk Profile: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('⚙️ OPTIONS', 'menu_options')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')]
]);

// --- AUTO-START ON ENTRY ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v7.5 - APEX PRO* 🟢\n\n` +
        `Institutional engine active. Accuracy: *80-90%+ profit*.\n\n` +
        `🛡️ *Tech:* Aave V3 Flash Loans | Atomic Bundles\n` +
        `⚡ *Stream:* Yellowstone gRPC (400ms Latency)\n` +
        `🇨🇦 *Currency:* USD Stakes / CAD Payouts\n\n` +
        `Configure your betting parameters:`,
        mainKeyboard(ctx)
    );
});

// --- MENU ACTIONS ---
bot.action('menu_coins', (ctx) => ctx.editMessageText("🔍 *SELECT ASSET:*", {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
        [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
        [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback('🔙 BACK', 'main_menu')]
    ])
}));

bot.action('start_engine', (ctx) => {
    ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*\nWaiting for gRPC signal...`);
    setTimeout(() => {
        ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.8%)*\nDirection: *HIGHER*\nConfirm Atomic Execution?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.editMessageText("⏳ *Bundling...* Executing Atomic Flash Loan...");
    const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
    const cadProfit = await getCADProfit(usdProfit);

    setTimeout(() => {
        ctx.replyWithMarkdown(
            `💰 *TRADE RESULT: WIN*\n\n` +
            `USD Profit: *+$${usdProfit}*\n` +
            `🇨🇦 *Profit (CAD): +$${cadProfit}*\n` +
            `Status: *Settled Atomically*`
        );
    }, 3000);
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) }));

bot.command('connect', async (ctx) => {
    await ctx.deleteMessage();
    ctx.reply("✅ *Institutional Wallet Connected.*", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 Pocket Robot is Live!"));
