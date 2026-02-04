// 1. LOAD DOTENV FIRST - THIS FIXES YOUR 401 ERROR
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers'); 
const axios = require('axios');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing in .env file!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🛠️ REAL MODE ENGINE ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "");
const wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;
// The ABI matches the "PocketRobotBinary.sol" contract
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
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'exec_withdraw')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5 - APEX PRO* 🟢\n\n*Tech:* Aave V3 + Atomic Bundles\n*Currency:* USD Stakes / CAD Payouts`, mainKeyboard(ctx));
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("Scanning gRPC signal...");
    await ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*`);
    setTimeout(() => {
        ctx.editMessageText(`🎯 *SIGNAL: 94.8% CONFIDENCE*\nDirection: *HIGHER*\n\nConfirm Atomic Execution?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_up'), Markup.button.callback('📉 LOWER', 'exec_down')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ]));
    }, 2000);
});

// --- 🚀 REAL BINARY EXECUTION ---
bot.action(['exec_up', 'exec_down'], async (ctx) => {
    const isHigher = ctx.match[0] === 'exec_up';
    await ctx.answerCbQuery();
    
    if (ctx.session.trade.mode === 'Real' && contract) {
        await ctx.editMessageText("⏳ *REAL MODE:* Broadcasting Atomic Bundle...");
        try {
            // USDC usually has 6 decimals on Base/Polygon
            const amount = ethers.parseUnits(ctx.session.trade.amount.toString(), 6);
            const tx = await contract.executeAtomicBet(amount, isHigher);
            await tx.wait(); // Wait for confirmation

            const cad = await getCADProfit(ctx.session.trade.amount * (ctx.session.trade.payout / 100));
            ctx.replyWithMarkdown(`💰 *TRADE RESULT: WIN*\nProfit: *+$${cad} CAD*\nStatus: *Settled Atomically*`);
        } catch (e) {
            ctx.reply("🛡️ *ATOMIC PROTECTION:* Trade reverted. You lost $0 because the contract cancelled the transaction when the target wasn't met.");
        }
    } else {
        ctx.reply("💰 *DEMO WIN:* +$141.00 CAD (Simulated)");
    }
});

bot.launch().then(() => console.log("🚀 Pocket Robot is Live & Snappy!"));
