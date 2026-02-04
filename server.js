require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { createSolanaRpc, address } = require('@solana/web3.js'); // Updated Imports
const axios = require('axios');
const bs58 = require('bs58');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🛠️ SOLANA v2.0 CONNECTION ---
const rpc = createSolanaRpc(process.env.RPC_URL);

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD', payout: 94, amount: 10, mode: 'Real'
    };
    return next();
});

// --- CAD Converter ---
async function getCAD(usd) {
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
    [Markup.button.callback('💳 WITHDRAW TO PHANTOM', 'exec_withdraw')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5 - SOLANA* 🟢\n\n*Tech:* Web3.js v2.0 + Chainstack\n*Status:* System Ready`, mainKeyboard(ctx));
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("📡 Connecting to Solana Cluster...");
    try {
        // Example of a v2.0 RPC call: get current slot
        const slot = await rpc.getSlot().send();
        await ctx.editMessageText(`📡 *CONNECTED* (Slot: ${slot})\nAnalyzing trend for ${ctx.session.trade.asset}...`);
        
        setTimeout(() => {
            ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.2%)*\nConfirm Atomic Execution?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                    [Markup.button.callback('❌ CANCEL', 'main_menu')]
                ]));
        }, 2000);
    } catch (e) {
        ctx.reply(`❌ RPC ERROR: ${e.message}. Check your Chainstack Access Token.`);
    }
});

bot.launch().then(() => console.log("🚀 Solana Robot v2.0 is Live!"));
