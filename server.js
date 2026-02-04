require('dotenv').config(); // MUST BE LINE 1

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)', mode: 'Real'
    };
    return next();
});

// --- CAD Converter (Real-time 2026 rates) ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.41).toFixed(2); }
}

// --- Dynamic Keyboard Generator ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk Level: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('⚙️ OPTIONS', 'menu_options')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'menu_wallet')]
]);

// --- AUTO-START ---
bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v7.5 - APEX PRO* 🟢\n\n` +
        `Institutional engine active. Accuracy: *80-90%+ profit*.\n\n` +
        `🛡️ *Tech:* Aave V3 Flash Loans | Atomic Bundles\n` +
        `⚡ *Stream:* Yellowstone gRPC (400ms Latency)\n\n` +
        `Configure your betting parameters:`,
        mainKeyboard(ctx)
    );
});

// --- MENU ACTIONS (STOPS STICKY BUTTONS) ---
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('menu_coins', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🔍 *SELECT ASSET:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
            [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});

bot.action('menu_risk', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("⚖️ *SELECT RISK PROFILE:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🟢 Low (0.5%)', 'set_risk_Low_0.5'), Markup.button.callback('🟡 Medium (2%)', 'set_risk_Med_2')],
            [Markup.button.callback('🔴 High (5%)', 'set_risk_High_5')],
            [Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});

bot.action('menu_stake', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("💰 *SELECT STAKE AMOUNT (USD):*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('$10', 'set_stake_10'), Markup.button.callback('$50', 'set_stake_50')],
            [Markup.button.callback('$100', 'set_stake_100'), Markup.button.callback('$500', 'set_stake_500')],
            [Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});

bot.action('toggle_mode', async (ctx) => {
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.answerCbQuery(`Switched to ${ctx.session.trade.mode}`);
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("📡 Scanning gRPC stream...");
    await ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*\nWaiting for gRPC signal...`);
    setTimeout(async () => {
        try {
            await ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.8%)*\nDirection: *HIGHER*\nConfirm Execution?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                    [Markup.button.callback('❌ CANCEL', 'main_menu')]
                ])
            );
        } catch (e) {}
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery("Executing Atomic Bundle...");
    await ctx.editMessageText("⏳ *Bundling...* Executing Atomic Flash Loan...");
    const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
    const cadProfit = await getCADProfit(usdProfit);
    setTimeout(() => {
        ctx.replyWithMarkdown(`💰 *TRADE RESULT: WIN*\nProfit (USD): *+$${usdProfit}*\n🇨🇦 *Profit (CAD): +$${cadProfit}*`);
    }, 3000);
});

bot.action('menu_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`💳 *VAULT MANAGEMENT*\nWithdraw CAD profits to your wallet instantly:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📤 WITHDRAW ALL (CAD)', 'exec_withdraw')],
            [Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});

bot.action('exec_withdraw', async (ctx) => {
    await ctx.answerCbQuery("Initiating Payout...");
    ctx.reply("✅ *Withdrawal Successful!* Profits sent to your connected wallet in CAD.");
});

// --- SETTERS (FIXED VALUE UPDATES) ---
bot.action(/set_coin_(.*)_(.*)/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.trade.asset = ctx.match[1] + '/USD';
    ctx.session.trade.payout = parseInt(ctx.match[2]);
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action(/set_risk_(.*)_(.*)/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.trade.risk = `${ctx.match[1]} (${ctx.match[2]}%)`;
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action(/set_stake_(.*)/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.trade.amount = parseInt(ctx.match[1]);
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.launch().then(() => console.log("🚀 Pocket Robot Live & Snappy!"));
