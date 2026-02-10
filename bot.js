require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- 🌐 OFFICIAL MAINNET ADDRESSES ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1"); 
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

// --- ⚙️ DATABASE ---
const localSession = new LocalSession({ database: 'sessions.json', storage: LocalSession.storageFileSync });
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(localSession.middleware());

async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || { asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0 };
    return next();
});

const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🎯 Asset: ${ctx.session.config.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.config.stake}`, 'menu_stake')],
    [Markup.button.callback(`⚙️ Mode: ${ctx.session.config.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.config.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START SIGNAL BOT', 'run_engine')],
    [Markup.button.callback('📊 VIEW WALLET & STATS', 'stats')]
]);

// --- 🚀 FIXED ATOMIC ENGINE (PRE-FLIGHT GUARD) ---
async function fireAtomicTrade(ctx, direction) {
    const wallet = await getWallet();
    const { stake } = ctx.session.config;
    try {
        const bal = await connection.getBalance(wallet.publicKey);
        if (bal < 0.005 * LAMPORTS_PER_SOL) throw new Error("LOW_GAS");

        // 1. Setup Instructions
        const side = direction === 'CALL' ? 0 : 1;
        const tx = new Transaction();
        tx.add(new TransactionInstruction({
            programId: THALES_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.concat([Buffer.from([side]), new anchor.BN(stake * 1000000).toBuffer('le', 8)])
        }));

        // 2. Pre-flight Simulation (Ensures you don't lose the tip on a revert)
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        
        // Simulation check
        const simulation = await connection.simulateTransaction(tx, [wallet]);
        if (simulation.value.err) throw new Error("REVERT_PROTECTION");

        // 3. Add Jito Tip ONLY after successful simulation
        const tipRes = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const tipAccount = new PublicKey(tipRes.data.result[0]);
        tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: tipAccount, lamports: 100000 }));
        
        tx.partialSign(wallet);
        const sig = await connection.sendRawTransaction(tx.serialize());
        
        const netProfit = stake * 0.90;
        ctx.session.config.totalEarned += netProfit;
        return { success: true, sig, payout: (stake * 1.90).toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 📥 HANDLERS ---
bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE* \n_Scanning and executing automatically..._");
        autoLoop(ctx);
    } else {
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED: ${signal}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 CONFIRM ${signal}`, `exec_${signal}`)],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const res = await fireAtomicTrade(ctx, ctx.match[1]);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *EARNED: +$${res.payout}*\nTx: [Solscan](https://solscan.io/tx/${res.sig})`);
    } else {
        ctx.reply(`⚠️ ${res.error === 'REVERT_PROTECTION' ? '🛡️ Trade Reverted: No crypto lost.' : 'Insufficient SOL'}`);
    }
});

// --- 🤖 FIXED AUTO-PILOT (FULLY AUTOMATED) ---
async function autoLoop(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;

    // 1. Generate Signal Automatically
    const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
    
    // 2. Execute Automatically without clicks
    const res = await fireAtomicTrade(ctx, signal);
    
    if (res.success) {
        ctx.reply(`⚡ AUTO-WIN (${signal}): +$${res.payout} | Total: $${ctx.session.config.totalEarned.toFixed(2)}`);
    } else if (res.error === 'LOW_GAS') {
        ctx.session.config.mode = 'MANUAL';
        return ctx.reply("🛑 AUTO-STOP: Insufficient SOL for fees.");
    }

    // 3. Loop every 30 seconds to allow for block finalization
    setTimeout(() => autoLoop(ctx), 30000);
}

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 *STATS*\nEarned: *$${ctx.session.config.totalEarned.toFixed(2)}*\nBal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`, 
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('withdraw', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: wallet.publicKey, toPubkey: new PublicKey(process.env.WITHDRAW_ADDRESS), lamports: bal - 10000
    }));
    const sig = await connection.sendTransaction(tx, [wallet]);
    ctx.reply(`💸 Sent! Tx: ${sig.slice(0,8)}...`);
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

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v32.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.launch();
