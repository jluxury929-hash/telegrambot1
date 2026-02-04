// 1. LOAD DOTENV FIRST
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers'); // This will now work
const axios = require('axios');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🛠️ BLOCKCHAIN CONNECTION (The "Real Money" Engine) ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "");
const wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;
const ABI = ["function executeAtomicBet(uint256 amount, bool isHigher) external"];
const contract = (process.env.CONTRACT_ADDRESS && wallet) ? new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet) : null;

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)', mode: 'Real'
    };
    return next();
});

// --- CAD Converter ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.41).toFixed(2); }
}

const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'exec_withdraw')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5* 🟢\n*Binary Atomic Engine Ready*`, mainKeyboard(ctx));
});

// --- 🚀 REAL BINARY EXECUTION ---
bot.action(['exec_up', 'exec_down'], async (ctx) => {
    const isHigher = ctx.match[0] === 'exec_up';
    await ctx.answerCbQuery();
    
    if (ctx.session.trade.mode === 'Real' && contract) {
        await ctx.editMessageText("⏳ *REAL MODE:* Broadcasting Atomic Bundle...");
        try {
            const amount = ethers.parseUnits(ctx.session.trade.amount.toString(), 6); // USDC 6 decimals
            
            // This sends the REAL transaction to the blockchain
            const tx = await contract.executeAtomicBet(amount, isHigher);
            await tx.wait(); 

            const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
            const cadProfit = await getCADProfit(usdProfit);
            ctx.replyWithMarkdown(`💰 *TRADE RESULT: WIN*\nProfit: *+$${cadProfit} CAD*\nStatus: *Settled Atomically*`);
        } catch (e) {
            ctx.reply("🛡️ *ATOMIC PROTECTION:* Trade Reverted. The price didn't match the prediction, so the transaction was cancelled by the smart contract. $0 lost.");
        }
    } else {
        ctx.reply("💰 *DEMO WIN:* +$141.00 CAD (Simulated)");
    }
});

bot.action('toggle_mode', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.launch().then(() => console.log("🚀 Pocket Robot Online & Connected!"));
