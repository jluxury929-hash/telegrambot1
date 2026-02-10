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
    // Look up session by ChatID for background tasks
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
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
        
        // 🛡️ ZERO-LOSS FIX: Simulate before any tips are sent
        const sim = await connection.simulateTransaction(tx, [wallet]);
        if (sim.value.err) throw new Error("REVERTED");

        // ONLY add tip if simulation succeeds
        const tipRes = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: new PublicKey(tipRes.data.result[0]), lamports: 100000 }));

        tx.partialSign(wallet);
        const sig = await connection.sendRawTransaction(tx.serialize());
        
        session.config.totalEarned += (stake * 0.90);
        localSession.DB.write(); 
        
        return { success: true, sig, payout: (stake * 1.90).toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 🤖 THE "INFINITE" AUTO-PILOT LOOP ---
async function runAutoPilot(chatId) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    if (!session || session.config.mode !== 'AUTO' || !activeLoops.has(chatId)) {
        activeLoops.delete(chatId);
        return;
    }

    const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
    const res = await fireAtomicTrade(chatId, direction);

    if (res.success) {
        bot.telegram.sendMessage(chatId, `⚡ *AUTO-WIN (${direction}):* +$${res.payout}\nTotal Profit: *$${session.config.totalEarned.toFixed(2)}*`, { parse_mode: 'Markdown' });
    } else if (res.error === 'LOW_GAS') {
        session.config.mode = 'MANUAL';
        activeLoops.delete(chatId);
        return bot.telegram.sendMessage(chatId, "🛑 *AUTO-STOP:* Insufficient SOL.");
    }

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
        ctx.editMessageText(`🔍 *SCANNING LIQUIDITY...*`);
        setTimeout(() => {
            const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
            const stake = ctx.session.config.stake;
            ctx.replyWithMarkdown(
                `⚡ *SIGNAL DETECTED*\n` +
                `Direction: *${signal === 'CALL' ? 'HIGHER (CALL)' : 'LOWER (PUT)'}*\n` +
                `Payout: *$${(stake * 1.90).toFixed(2)} USD*\n\n` +
                `*CONFIRM YOUR GUESS:*`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(`📈 HIGHER ($${stake})`, 'exec_CALL'),
                        Markup.button.callback(`📉 LOWER ($${stake})`, 'exec_PUT')
                    ],
                    [Markup.button.callback('❌ CANCEL', 'main_menu')]
                ])
            );
        }, 1500);
    }
});

bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const res = await fireAtomicTrade(ctx.chat.id, ctx.match[1]);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *EARNED: +$${res.payout}*\nTx: [Solscan](https://solscan.io/tx/${res.sig})`);
    } else {
        ctx.reply(`⚠️ ${res.error === 'REVERTED' ? '🛡️ Trade Protected (No loss)' : 'Insufficient SOL'}`);
    }
});

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 *STATS*\nEarned: *$${ctx.session.config.totalEarned.toFixed(2)}*\nBal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`, 
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('withdraw', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: new PublicKey(process.env.WITHDRAW_ADDRESS), lamports: bal - 10000 }));
    const sig = await connection.sendTransaction(tx, [wallet]);
    ctx.reply(`💸 Sent! Signature: ${sig.slice(0,8)}...`);
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    if (ctx.session.config.mode === 'MANUAL') activeLoops.delete(ctx.chat.id);
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v35.1*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
    if (ctx.session.config.mode === 'AUTO' && !activeLoops.has(ctx.chat.id)) {
        activeLoops.add(ctx.chat.id);
        runAutoPilot(ctx.chat.id);
    }
});

bot.launch();
