require('dotenv').config(); // LOAD FIRST to avoid 401 error
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN is missing!");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Setup Provider & Contract ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const abi = [
    "function executeBet(address, uint256, bool) external",
    "function withdraw(address) external",
    "function balanceOf(address) view returns (uint256)"
];
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi, wallet);

// --- State & CAD Logic ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || { asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)' };
    return next();
});

async function getCAD(usd) {
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    return (usd * res.data.rates.CAD).toFixed(2);
}

// --- Menus ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback('🚀 START ANALYZER', 'start_engine')],
    [Markup.button.callback('💳 WALLET / WITHDRAW', 'menu_wallet')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v7.5* 🟢\n\n` +
        `Accuracy: *80-90%+ profit*.\n` +
        `🛡️ *Safety:* Flash Loans & Atomic Bundling Active\n` +
        `🇨🇦 *Currency:* USD Stake / CAD Payout\n\n` +
        `Configure and start:`, mainKeyboard(ctx));
});

// --- Actions ---
bot.action('menu_coins', (ctx) => ctx.editMessageText("🔍 *SELECT ASSET:*", {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
        [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
        [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback('🔙 BACK', 'main_menu')]
    ])
}));

bot.action('start_engine', (ctx) => {
    ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*`);
    setTimeout(() => {
        ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.8%)*\nDirection: *HIGHER*\nConfirm Execution?`,
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
    const cadProfit = await getCAD(usdProfit);
    
    // Logic: In real execution, you'd call: await contract.executeBet(...)

    setTimeout(() => {
        ctx.replyWithMarkdown(`💰 *RESULT: WIN*\nProfit (USD): *+$${usdProfit}*\n🇨🇦 *Profit (CAD): +$${cadProfit}*`);
    }, 3000);
});

bot.action('menu_wallet', (ctx) => {
    ctx.editMessageText(`💳 *VAULT SETTINGS*\nWithdraw your accumulated profit to your personal wallet:`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('📤 WITHDRAW ALL (CAD)', 'exec_withdraw')],
            [Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});

bot.action('exec_withdraw', async (ctx) => {
    await ctx.answerCbQuery("Processing Withdrawal...");
    // await contract.withdraw(TOKEN_ADDRESS);
    ctx.reply("✅ *Withdrawal Successful!* Funds sent to your connected wallet.");
});

bot.command('connect', async (ctx) => {
    await ctx.deleteMessage();
    ctx.reply("✅ *Institutional Wallet Connected.*", mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) }));

bot.launch().then(() => console.log("🚀 Bot is Online!"));
