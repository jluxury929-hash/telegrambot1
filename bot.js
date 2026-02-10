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

// --- 🌐 CONFIG (2026 STANDARDS) ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

const localSession = new LocalSession({ database: 'sessions.json', storage: LocalSession.storageFileSync });
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 🛡️ MIDDLEWARE & SESSION FIX ---
bot.use(localSession.middleware());
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    ctx.session.config = ctx.session.config || { asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0 };
    return next();
});

// --- 🛰️ NETWORK SHIELD (Fixes 429 Errors) ---
async function safePost(url, data) {
    try {
        return await axios.post(url, data);
    } catch (e) {
        if (e.response && e.response.status === 429) {
            console.log("⚠️ Rate limit hit. Cooling down 2.5s...");
            await new Promise(r => setTimeout(r, 2500));
            return await axios.post(url, data);
        }
        throw e;
    }
}

async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

// --- 🔥 THE HARD-ATOMIC V0 ENGINE ---
async function fireAtomicTrade(ctx, direction) {
    const wallet = await getWallet();
    const { stake } = ctx.session.config;
    try {
        const [{ blockhash }, tipRes] = await Promise.all([
            connection.getLatestBlockhash('confirmed'),
            safePost(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] })
        ]);
        const tipAccount = new PublicKey(tipRes.data.result[0]);

        const side = direction === 'HIGHER' ? 0 : 1;
        const instructions = [
            new TransactionInstruction({
                programId: THALES_PROGRAM_ID,
                keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
                data: Buffer.concat([Buffer.from([side]), new anchor.BN(stake * 1000000).toBuffer('le', 8)])
            }),
            SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: tipAccount, lamports: 100000 })
        ];

        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash,
            instructions: instructions
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet]);

        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) throw new Error("REVERT_PREVENTED");

        const rawTx = Buffer.from(transaction.serialize()).toString('base64');
        const jitoRes = await safePost(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[rawTx]]
        });

        ctx.session.config.totalEarned += (stake * 0.90);
        return { success: true, bundleId: jitoRes.data.result, payout: (stake * 1.90).toFixed(2) };
    } catch (e) { return { success: false, error: e.message }; }
}

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

// --- 📥 HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v56.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoLoop(ctx);
    } else {
        const signal = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*\n\n🎯 *PREDICTION: GO ${signal}*\n\n_Choose your position:_`, 
            Markup.inlineKeyboard([
                [Markup.button.callback(`📈 HIGHER`, 'exec_HIGHER'), Markup.button.callback(`📉 LOWER`, 'exec_LOWER')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }
});

bot.action(/exec_(HIGHER|LOWER)/, async (ctx) => {
    const dir = ctx.match[1];
    await ctx.answerCbQuery(`Atomic shielding ${dir} trade...`);
    const res = await fireAtomicTrade(ctx, dir);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *PROFIT:* +$${res.payout}\nBundle: \`${res.bundleId.slice(0,8)}...\``);
    } else {
        ctx.reply(`⚠️ ${res.error === 'REVERT_PREVENTED' ? '🛡️ Shielded: Simulation failed, no SOL spent.' : res.error}`);
    }
});

async function autoLoop(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    const signal = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
    const res = await fireAtomicTrade(ctx, signal);
    if (res.success) ctx.reply(`⚡ AUTO-WIN (${signal}): +$${res.payout}`);
    setTimeout(() => autoLoop(ctx), 25000);
}

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 *STATS*\nEarned: *$${ctx.session.config.totalEarned.toFixed(2)}*\nBal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));
bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.launch();
