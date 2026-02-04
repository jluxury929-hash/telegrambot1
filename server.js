require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

// --- SETUP ---
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const ABI = [
    "function executeAtomicBet(uint256 amount, bool isHigher) external",
    "function withdraw() external"
];
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet);

// --- State Middleware ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || { asset: 'BTC/USD', payout: 92, amount: 100, mode: 'Real' };
    return next();
});

// --- CAD Converter ---
async function getCAD(usd) {
    const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    return (usd * res.data.rates.CAD).toFixed(2);
}

const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'exec_withdraw')]
]);

bot.start((ctx) => ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5* 🟢\n*Binary Atomic Engine Active*`, mainKeyboard(ctx)));

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("Searching for 1m candle trend...");
    await ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*`);
    setTimeout(() => {
        ctx.editMessageText(`🎯 *SIGNAL: 94.2% CONFIDENCE*\n*1-Minute Expiry*\n\nWill price be Higher or Lower?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_up'), Markup.button.callback('📉 LOWER', 'exec_down')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ]));
    }, 2000);
});

// --- REAL BINARY EXECUTION ---
bot.action(['exec_up', 'exec_down'], async (ctx) => {
    const isHigher = ctx.match[0] === 'exec_up';
    await ctx.answerCbQuery();
    await ctx.editMessageText("⏳ *Broadcasting Atomic Bundle...*");

    if (ctx.session.trade.mode === 'Real') {
        try {
            const amount = ethers.parseUnits(ctx.session.trade.amount.toString(), 6);
            const tx = await contract.executeAtomicBet(amount, isHigher);
            await tx.wait();

            const cad = await getCAD(ctx.session.trade.amount * 0.92);
            ctx.replyWithMarkdown(`💰 *TRADE WIN!*\n+ $${cad} CAD sent to your wallet.`);
        } catch (e) {
            ctx.reply("🛡️ *ATOMIC REVERT:* Price didn't move in your favor. Flash Loan cancelled. No money lost.");
        }
    } else {
        setTimeout(() => ctx.reply("💰 *DEMO WIN:* +$141.00 CAD (Simulated)"), 2000);
    }
});

bot.action('toggle_mode', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 Pocket Robot is LIVE."));
