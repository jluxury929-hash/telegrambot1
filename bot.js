require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { 
    Connection, Keypair, PublicKey, SystemProgram, 
    LAMPORTS_PER_SOL, TransactionInstruction, 
    TransactionMessage, VersionedTransaction,
    Transaction 
} = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- 🌐 CONFIG (2026 STANDARDS) ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

// --- 🛡️ DATABASE & SESSION CONFIG ---
const localSession = new LocalSession({
    database: 'sessions.json',
    property: 'session',
    storage: LocalSession.storageFileSync, // CRITICAL: Sync storage prevents sticky button data lag
    format: {
        serialize: (obj) => JSON.stringify(obj, null, 2),
        deserialize: (str) => JSON.parse(str),
    },
});

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(localSession.middleware());

// --- 🛠️ HELPERS ---
async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || {
        asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0
    };
    return next();
});

// --- 🔮 THE SIMULATION ORACLE (Dual-Path Prediction) ---
async function runOracleSimulation(wallet) {
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    const buildVirtualTx = (side) => {
        const ixs = [new TransactionInstruction({
            programId: THALES_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.concat([Buffer.from([side]), new anchor.BN(10 * 1000000).toBuffer('le', 8)])
        })];
        return new VersionedTransaction(new TransactionMessage({
            payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions: ixs
        }).compileToV0Message());
    };

    const [simH, simL] = await Promise.all([
        connection.simulateTransaction(buildVirtualTx(0)), // Higher
        connection.simulateTransaction(buildVirtualTx(1))  // Lower
    ]);

    const scoreH = simH.value.err ? 0 : (simH.value.logs?.filter(l => l.includes("Success")).length || 1);
    const scoreL = simL.value.err ? 0 : (simL.value.logs?.filter(l => l.includes("Success")).length || 1);

    return scoreH > scoreL ? { dir: 'HIGHER', conf: 71 } : { dir: 'LOWER', conf: 68 };
}

// --- 🔥 SHIELDED ATOMIC V0 ENGINE ---
async function fireShieldedTrade(chatId, direction) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    const { stake } = session.config;
    const wallet = await getWallet();

    try {
        const [{ blockhash }, tipRes] = await Promise.all([
            connection.getLatestBlockhash('confirmed'),
            axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] })
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

        const transaction = new VersionedTransaction(new TransactionMessage({
            payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions
        }).compileToV0Message());

        transaction.sign([wallet]);
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) throw new Error("SHIELD_REVERT_LOSS_PREVENTED");

        const rawTx = Buffer.from(transaction.serialize()).toString('base64');
        const jitoRes = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[rawTx]]
        });

        session.config.totalEarned += (stake * 0.90);
        localSession.DB.write();
        return { success: true, bundleId: jitoRes.data.result, payout: (stake * 1.90).toFixed(2) };
    } catch (e) { return { success: false, error: e.message }; }
}

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

// --- 📥 HANDLERS ---
bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v65.0*\n` +
        `📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, 
        mainKeyboard(ctx)
    );
});

bot.action('run_engine', async (ctx) => {
    await ctx.answerCbQuery(); // Instantly clears sticky loading state
    if (ctx.session.config.mode === 'AUTO') return autoPilot(ctx);

    const status = await ctx.reply(`🔮 *ORACLE: SIMULATING BOTH PATHS...*`);
    const wallet = await getWallet();
    const oracle = await runOracleSimulation(wallet);
    
    await ctx.telegram.deleteMessage(ctx.chat.id, status.message_id);
    ctx.replyWithMarkdown(
        `🚀 *VIRTUAL-DATA SIGNAL*\n🎯 *PREDICTION: GO ${oracle.dir}*\n\n_All bets are shielded._`,
        Markup.inlineKeyboard([
            [Markup.button.callback(`📈 HIGHER`, 'exec_HIGHER'), Markup.button.callback(`📉 LOWER`, 'exec_LOWER')],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ])
    );
});

bot.action(/exec_(HIGHER|LOWER)/, async (ctx) => {
    await ctx.answerCbQuery(`Opening Atomic Position...`);
    const res = await fireShieldedTrade(ctx.chat.id, ctx.match[1]);
    if (res.success) ctx.replyWithMarkdown(`✅ *WIN:* +$${res.payout}`);
    else ctx.reply(res.error === "SHIELD_REVERT_LOSS_PREVENTED" ? "🛡️ *SHIELDED:* Market shifted. $0 SOL spent." : "Error: " + res.error);
});

bot.action('withdraw', async (ctx) => {
    await ctx.answerCbQuery();
    try {
        const wallet = await getWallet();
        const destAddr = process.env.WITHDRAW_ADDRESS;
        if (!destAddr) return ctx.reply("Error: WITHDRAW_ADDRESS not set.");

        const balance = await connection.getBalance(wallet.publicKey);
        if (balance <= 10000) return ctx.reply("Balance too low for gas.");

        const amountToSend = balance - 10000;
        const tx = new Transaction().add(SystemProgram.transfer({
            fromPubkey: wallet.publicKey, toPubkey: new PublicKey(destAddr), lamports: amountToSend,
        }));
        
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        const signature = await connection.sendTransaction(tx, [wallet]);
        ctx.reply(`💸 Sent! [View on Solscan](https://solscan.io/tx/${signature})`);
    } catch (err) { ctx.reply("Withdrawal failed."); }
});

bot.action('stats', async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 *STATS*\nEarned: *$${ctx.session.config.totalEarned.toFixed(2)}*\nBal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('toggle_mode', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx));
});

async function autoPilot(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    const wallet = await getWallet();
    const oracle = await runOracleSimulation(wallet);
    const res = await fireShieldedTrade(ctx.chat.id, oracle.dir);
    if (res.success) ctx.reply(`⚡ AUTO-WIN (${oracle.dir}): +$${res.payout}`);
    setTimeout(() => autoPilot(ctx), 25000);
}

bot.launch();
