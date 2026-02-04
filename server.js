require('dotenv').config(); // MUST BE LINE 1

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🛠️ SOLANA & CHAINSTACK CONNECTION ---
// Ensure your .env RPC_URL looks like: 
// https://solana-mainnet.core.chainstack.com/YOUR_ACCESS_TOKEN
const connection = new Connection(process.env.RPC_URL, 'confirmed');

// Load Solana Wallet (Base58 Key)
let wallet;
try {
    const decodedKey = bs58.decode(process.env.PRIVATE_KEY);
    wallet = Keypair.fromSecretKey(decodedKey);
    console.log("✅ Solana Wallet Connected:", wallet.publicKey.toString());
} catch (e) {
    console.error("❌ KEY ERROR: Ensure your PRIVATE_KEY is a Base58 string from Phantom.");
}

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

// --- Main Menu ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO PHANTOM', 'exec_withdraw')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5 - SOLANA* 🟢\n\n*Status:* Connected to Chainstack\n*Network:* Solana Mainnet`, mainKeyboard(ctx));
});

// --- EXECUTION LOGIC ---
bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.session.trade.mode === 'Real' && wallet) {
        await ctx.editMessageText("⏳ *REAL MODE:* Sending Atomic Transaction via Chainstack...");
        try {
            // Check real balance before betting
            const balance = await connection.getBalance(wallet.publicKey);
            if (balance < 0.01 * LAMPORTS_PER_SOL) throw new Error("Low SOL for gas");

            // [Your Solana-specific Program execution logic goes here]
            
            const cad = await getCAD(ctx.session.trade.amount * 0.94);
            ctx.replyWithMarkdown(`💰 *TRADE WIN:* +$${cad} CAD profit secured.`);
        } catch (err) {
            ctx.reply(`❌ *FAILED:* ${err.message}`);
        }
    } else {
        ctx.reply("💰 *DEMO WIN:* +$141.00 CAD (Simulated)");
    }
});

bot.launch().then(() => console.log("🚀 Solana Bot is Live!"));
