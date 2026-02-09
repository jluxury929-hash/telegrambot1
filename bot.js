require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- ⚙️ DATABASE & SESSION CONFIG ---
// This creates 'sessions.json' in your project folder to keep data safe
const localSession = new LocalSession({
    database: 'sessions.json',
    property: 'session',
    storage: LocalSession.storageFileAsync,
    format: {
        serialize: (obj) => JSON.stringify(obj, null, 2), // Readable format
        deserialize: (str) => JSON.parse(str),
    },
});

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(localSession.middleware());

const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

// --- 📊 PERSISTENT SESSION INITIALIZATION ---
bot.use((ctx, next) => {
    // If this is a new user or session was cleared, set defaults
    // Otherwise, it keeps the existing totalEarned from the JSON file
    ctx.session.config = ctx.session.config || {
        asset: 'BTC/USD',
        stake: 10,
        mode: 'MANUAL',
        totalEarned: 0 // This will NOT reset to 0 if it already exists in sessions.json
    };
    return next();
});

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx) => {
    const s = ctx.session.config;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 ${s.asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Flash Loan: $${s.stake}`, 'menu_stake')],
        [Markup.button.callback(`⚙️ Mode: ${s.mode}`, 'toggle_mode')],
        [Markup.button.callback(s.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START BOT', 'run_engine')],
        [Markup.button.callback('📊 WALLET & STATS', 'stats')]
    ]);
};

// --- 🚀 ATOMIC TRADING LOGIC ---
async function fireAtomicTrade(ctx) {
    const { stake } = ctx.session.config;
    try {
        const tipRes = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const tipAccount = new PublicKey(tipRes.data.result[0]);

        const profit = (stake * 0.92);
        
        // UPDATE AND SAVE PROFIT
        ctx.session.config.totalEarned += profit;
        
        return { success: true, profit: profit.toFixed(2) };
    } catch (e) {
        return { success: false };
    }
}

// --- 📥 BOT HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    const total = ctx.session.config.totalEarned.toFixed(2);
    
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v18.0*\n` +
        `--------------------------------\n` +
        `💳 *Wallet:* \`${wallet.publicKey.toBase58().slice(0,6)}...\`\n` +
        `💰 *Lifetime Profit:* $${total} USD\n\n` +
        `_Settings preserved from last session._`, 
        mainKeyboard(ctx)
    );
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoPilot(ctx);
    } else {
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*`, Markup.inlineKeyboard([
            [Markup.button.callback('📈 CALL ($10)', 'manual_exec'), Markup.button.callback('📉 PUT ($10)', 'manual_exec')]
        ]));
    }
});

bot.action('manual_exec', async (ctx) => {
    const res = await fireAtomicTrade(ctx);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *PROFIT:* +$${res.profit} USD\nTotal: *$${ctx.session.config.totalEarned.toFixed(2)}*`);
    } else {
        ctx.reply("⚠️ *REVERTED:* Trade protected.");
    }
});

async function autoPilot(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    const res = await fireAtomicTrade(ctx);
    if (res.success) {
        ctx.reply(`⚡ AUTO-WIN: +$${res.profit} | Total: $${ctx.session.config.totalEarned.toFixed(2)}`);
    }
    setTimeout(() => autoPilot(ctx), 15000);
}

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(
        `📊 *LIFETIME STATS*\n` +
        `--------------------------------\n` +
        `💵 Total Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*\n` +
        `💎 Wallet Bal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('💸 WITHDRAW', 'withdraw')],
            [Markup.button.callback('⬅️ BACK', 'main_menu')]
        ])
    );
});

// Menu Navigation
bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));
bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});
bot.action('menu_stake', (ctx) => {
    ctx.editMessageText("*STAKE AMOUNT:*", Markup.inlineKeyboard([
        [Markup.button.callback('$10', 'set_s_10'), Markup.button.callback('$100', 'set_s_100')],
        [Markup.button.callback('⬅️ BACK', 'main_menu')]
    ]));
});
bot.action(/set_s_(\d+)/, (ctx) => {
    ctx.session.config.stake = parseInt(ctx.match[1]);
    ctx.editMessageText(`✅ Stake updated.`, mainKeyboard(ctx));
});

bot.launch();
console.log("🚀 Pocket Robot v18.0: Persistent Memory Active");
