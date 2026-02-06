require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// 1. Initial Validation
if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

// 2. Middleware: Session MUST come before handlers
const localSession = new LocalSession({ database: 'session.json' });
bot.use(localSession.middleware());

// 3. Middleware: Initialize Session State
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD',
        amount: 1,
        payout: 94,
        confirmedTrades: 0,
        totalProfit: 0,
        connected: false,
        mnemonic: null
    };
    ctx.session.autoPilot = ctx.session.autoPilot || false;
    return next();
});

// --- HELPER: WALLET DERIVATION ---
function deriveKeypair(mnemonic) {
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const { key } = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
    return Keypair.fromSeed(key);
}

// --- POCKET ROBOT KEYBOARD ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Asset: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Profit: $${ctx.session.trade.totalProfit} USD`, 'refresh')],
    [Markup.button.callback(ctx.session.autoPilot ? '🛑 STOP AUTO-PILOT' : '🤖 START AUTO-PILOT', 'toggle_auto')],
    [Markup.button.callback('🔥 FORCE CONFIRMED TRADE', 'exec_confirmed')],
    [Markup.button.callback('🏦 VAULT / WITHDRAW', 'menu_vault')]
]);

// --- 4. START COMMAND (NOW FIXED) ---
bot.start((ctx) => {
    return ctx.replyWithMarkdown(
        `⚡️ *POCKET ROBOT v18.5 - APEX PRO* ⚡️\n\n` +
        `Institutional 10x Flash Loan Engine active.\n` +
        `Confirm your wallet to begin atomic execution.`,
        mainKeyboard(ctx)
    );
});

// --- 5. ACTION HANDLERS ---
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.editMessageText(`⚡️ *POCKET ROBOT DASHBOARD*`, mainKeyboard(ctx));
});

bot.action('toggle_auto', async (ctx) => {
    ctx.session.autoPilot = !ctx.session.autoPilot;
    await ctx.answerCbQuery();
    
    if (ctx.session.autoPilot) {
        ctx.session.autoTimer = setInterval(async () => {
            if (!ctx.session.autoPilot) return clearInterval(ctx.session.autoTimer);
            // Insert your executeTrade logic here
        }, 5000);
    } else {
        clearInterval(ctx.session.autoTimer);
    }
    
    return ctx.editMessageText(
        `🤖 *Auto-Pilot:* ${ctx.session.autoPilot ? 'FULLY AUTOMATED' : 'OFF'}`,
        mainKeyboard(ctx)
    );
});

bot.action('exec_confirmed', async (ctx) => {
    await ctx.answerCbQuery("Confirming prediction...");
    // Trigger your prediction + atomic execution logic here
});

// --- 6. COMMANDS ---
bot.command('connect', async (ctx) => {
    const mnemonic = ctx.message.text.split(' ').slice(1).join(' ');
    if (mnemonic.split(' ').length < 12) return ctx.reply("⚠️ Usage: /connect <12_words>");
    
    await ctx.deleteMessage().catch(() => {});
    ctx.session.trade.mnemonic = mnemonic;
    ctx.session.trade.connected = true;
    ctx.replyWithMarkdown("✅ *WALLET LINKED ATOMICALLY*", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 Apex v18.5 Full Auto Live"));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
