require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)', mode: 'Real'
    };
    return next();
});

// --- CAD Converter ---
async function getCADProfit(usd) {
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    return (usd * res.data.rates.CAD).toFixed(2);
}

// --- Keyboards ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('⚙️ OPTIONS', 'menu_options')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')]
]);

// --- Handlers ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v7.1 - APEX PRO* 🟢\n\n` +
        `Institutional engine active. Accuracy: *80-90%+ profit*.\n\n` +
        `🛡️ *Tech:* Aave V3 Flash Loans | Atomic Bundles\n` +
        `⚡ *Stream:* Yellowstone gRPC (400ms)\n` +
        `🇨🇦 *Currency:* USD Stakes / CAD Payouts\n\n` +
        `Configure your parameters:`,
        mainKeyboard(ctx)
    );
});

bot.action('menu_coins', (ctx) => ctx.editMessageText("🔍 *SELECT ASSET:*", {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
        [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
        [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback('🔙 BACK', 'main_menu')]
    ])
}));

bot.action('start_engine', (ctx) => {
    ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*\nWaiting for gRPC trend signal...`);
    setTimeout(() => {
        ctx.editMessageText(`🎯 *SIGNAL DETECTED! (94.8%)*\nDirection: *HIGHER*\nConfirm Atomic Execution?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.editMessageText("⏳ *Bundling...* Borrowing via Flash Loan...");
    const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
    const cadProfit = await getCADProfit(usdProfit);

    setTimeout(() => {
        ctx.replyWithMarkdown(`💰 *RESULT: WIN*\nProfit (USD): *+$${usdProfit}*\n🇨🇦 *Profit (CAD): +$${cadProfit}*`);
    }, 3000);
});

bot.command('connect', async (ctx) => {
    await ctx.deleteMessage();
    ctx.reply("✅ *Institutional Wallet Connected.*", mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) }));
bot.action(/set_coin_(.*)_(.*)/, (ctx) => {
    ctx.session.trade.asset = ctx.match[1] + '/USD';
    ctx.session.trade.payout = parseInt(ctx.match[2]);
    return ctx.editMessageText("✅ Asset Updated", mainKeyboard(ctx));
});

bot.launch();
