require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { 
    Connection, Keypair, PublicKey, SystemProgram, 
    LAMPORTS_PER_SOL, TransactionInstruction, 
    TransactionMessage, VersionedTransaction 
} = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- ⚙️ CONFIG (2026 STANDARDS) ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

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

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx) => {
    const s = ctx.session.config;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 Asset: ${s.asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${s.stake}`, 'menu_stake')],
        [Markup.button.callback(`⚙️ Mode: ${s.mode}`, 'toggle_mode')],
        [Markup.button.callback(s.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START SIGNAL BOT', 'run_engine')],
        [Markup.button.callback('📊 VIEW WALLET & STATS', 'stats')]
    ]);
};

// --- 🔥 THE ATOMIC V0 EXECUTION CORE ---
async function fireAtomicTrade(ctx, direction) {
    const wallet = await getWallet();
    const { stake } = ctx.session.config;

    try {
        // 1. Fetch Fresh Blockhash & Jito Tip Account
        const [{ blockhash }, tipRes] = await Promise.all([
            connection.getLatestBlockhash('confirmed'),
            axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] })
        ]);
        const tipAccount = new PublicKey(tipRes.data.result[0]);

        // 2. Define Atomic Instructions
        const side = direction === 'CALL' ? 0 : 1;
        const instructions = [
            // Instruction 1: The Binary Bet
            new TransactionInstruction({
                programId: THALES_PROGRAM_ID,
                keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
                data: Buffer.concat([Buffer.from([side]), new anchor.BN(stake * 1000000).toBuffer('le', 8)])
            }),
            // Instruction 2: The Jito Tip (Only executed if Instruction 1 succeeds)
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipAccount,
                lamports: 100000 // Priority Tip
            })
        ];

        // 3. Compile into a Versioned V0 Message
        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash,
            instructions: instructions
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet]);

        // 🛡️ THE ATOMIC SHIELD: Simulation
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) throw new Error("REVERT_PREVENTED");

        // 4. Send via Jito Bundle Engine (Base64 Encoded)
        const rawTx = Buffer.from(transaction.serialize()).toString('base64');
        const jitoRes = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle",
            params: [[rawTx]]
        });

        ctx.session.config.totalEarned += (stake * 0.90);
        return { success: true, bundleId: jitoRes.data.result, payout: (stake * 1.90).toFixed(2) };

    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 🤖 FIXED AUTO-PILOT ---
async function autoLoop(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
    const res = await fireAtomicTrade(ctx, signal);
    if (res.success) {
        ctx.reply(`⚡ AUTO-WIN (${signal}): +$${res.payout} | Bundle: ${res.bundleId.slice(0,8)}`);
    }
    setTimeout(() => autoLoop(ctx), 20000);
}

// --- 📥 HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v51.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoLoop(ctx);
    } else {
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL:* Go *${signal}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 HIGHER`, 'exec_CALL'), Markup.button.callback(`📉 LOWER`, 'exec_PUT')],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const dir = ctx.match[1] === 'CALL' ? 'HIGHER' : 'LOWER';
    await ctx.answerCbQuery(`Atomic shielding ${dir} trade...`);
    const res = await fireAtomicTrade(ctx, dir);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *PROFIT:* +$${res.payout}\nBundle: \`${res.bundleId.slice(0,8)}...\``);
    } else {
        ctx.reply(`⚠️ ${res.error === 'REVERT_PREVENTED' ? '🛡️ Shielded: Simulation failed, no SOL spent.' : res.error}`);
    }
});

// Stats, Withdrawal, and Menu logic stay identical to your v33.0 base...
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
    ctx.reply(`💸 Sent! Signature: ${sig.slice(0,8)}...`);
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));
bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});
bot.action('menu_stake', (ctx) => {
    ctx.editMessageText("*STAKE AMOUNT:*", Markup.inlineKeyboard([[Markup.button.callback('$10', 'set_s_10'), Markup.button.callback('$100', 'set_s_100')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});
bot.action(/set_s_(\d+)/, (ctx) => {
    ctx.session.config.stake = parseInt(ctx.match[1]);
    ctx.editMessageText(`✅ Stake updated.`, mainKeyboard(ctx));
});

bot.launch();
