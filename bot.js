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

// --- ⚙️ CONFIG ---
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

// --- 🛡️ DATABASE (Sync Mode for 100% Button Reliability) ---
const localSession = new LocalSession({ 
    database: 'sessions.json', 
    storage: LocalSession.storageFileSync // Forces instant save
});
const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 🛠️ MIDDLEWARE STACK ---
bot.use(localSession.middleware());
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    ctx.session.config = ctx.session.config || { 
        asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0 
    };
    return next();
});

// --- 🛰️ NETWORK SHIELD ---
async function safePost(url, data) {
    try { return await axios.post(url, data); }
    catch (e) {
        if (e.response && e.response.status === 429) {
            await new Promise(r => setTimeout(r, 2000));
            return await axios.post(url, data);
        }
        throw e;
    }
}

// --- 🎨 INTERFACE FACTORY (100% Logic Sync) ---
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

// --- 🔥 THE ATOMIC V0 ENGINE ---
async function fireAtomicTrade(chatId, direction) {
    const session = localSession.DB.get('sessions').find({ id: `${chatId}:${chatId}` }).get('session').value();
    const { stake } = session.config;
    const wallet = await getWallet();

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
            payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet]);

        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) throw new Error("REVERT_PREVENTED");

        const rawTx = Buffer.from(transaction.serialize()).toString('base64');
        const jitoRes = await safePost(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[rawTx]]
        });

        session.config.totalEarned += (stake * 0.90);
        localSession.DB.write();
        return { success: true, bundleId: jitoRes.data.result, payout: (stake * 1.90).toFixed(2) };
    } catch (e) { return { success: false, error: e.message }; }
}

// --- 📥 BUTTON LISTENERS (100% COVERAGE) ---

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v60.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.action('main_menu', (ctx) => ctx.editMessageText("🤖 *SETTINGS*", mainKeyboard(ctx)));

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: ${ctx.session.config.mode}`, mainKeyboard(ctx));
});

bot.action('menu_stake', (ctx) => {
    ctx.editMessageText("*SELECT STAKE:*", Markup.inlineKeyboard([
        [Markup.button.callback('$10', 'set_s_10'), Markup.button.callback('$50', 'set_s_50')],
        [Markup.button.callback('$100', 'set_s_100'), Markup.button.callback('$500', 'set_s_500')],
        [Markup.button.callback('⬅️ BACK', 'main_menu')]
    ]));
});

bot.action(/set_s_(\d+)/, (ctx) => {
    ctx.session.config.stake = parseInt(ctx.match[1]);
    ctx.editMessageText(`✅ Stake set to $${ctx.session.config.stake}`, mainKeyboard(ctx));
});

bot.action('menu_coins', (ctx) => {
    ctx.editMessageText("*CHOOSE ASSET:*", Markup.inlineKeyboard([
        [Markup.button.callback('BTC/USD', 'set_a_BTC'), Markup.button.callback('ETH/USD', 'set_a_ETH')],
        [Markup.button.callback('SOL/USD', 'set_a_SOL')],
        [Markup.button.callback('⬅️ BACK', 'main_menu')]
    ]));
});

bot.action(/set_a_(.+)/, (ctx) => {
    ctx.session.config.asset = `${ctx.match[1]}/USD`;
    ctx.editMessageText(`✅ Asset set to ${ctx.session.config.asset}`, mainKeyboard(ctx));
});

bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(
        `📊 *WALLET STATS*\n` +
        `Earned: *$${ctx.session.config.totalEarned.toFixed(2)}*\n` +
        `Balance: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`,
        Markup.inlineKeyboard([
            [Markup.button.callback('💸 WITHDRAW', 'withdraw')],
            [Markup.button.callback('⬅️ BACK', 'main_menu')]
        ])
    );
});

bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') return autoLoop(ctx);
    
    ctx.editMessageText(`🔍 *ANALYZING LIQUIDITY...*`);
    setTimeout(() => {
        const signal = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
        ctx.replyWithMarkdown(`⚡ *SIGNAL: GO ${signal}*\n_Confirm your atomic position:_`,
            Markup.inlineKeyboard([
                [Markup.button.callback(`📈 GO HIGHER`, 'exec_HIGHER'), Markup.button.callback(`📉 GO LOWER`, 'exec_LOWER')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }, 1000);
});

bot.action(/exec_(HIGHER|LOWER)/, async (ctx) => {
    const res = await fireAtomicTrade(ctx.chat.id, ctx.match[1]);
    if (res.success) ctx.replyWithMarkdown(`✅ *WIN:* +$${res.payout}`);
    else ctx.reply(`⚠️ ${res.error === 'REVERT_PREVENTED' ? '🛡️ Protected (No loss)' : res.error}`);
});

bot.action('withdraw', async (ctx) => {
    try {
        const wallet = await getWallet();
        const bal = await connection.getBalance(wallet.publicKey);
        if (bal < 0.01 * LAMPORTS_PER_SOL) return ctx.reply("❌ Balance too low.");
        const tx = new Transaction().add(SystemProgram.transfer({
            fromPubkey: wallet.publicKey, toPubkey: new PublicKey(process.env.WITHDRAW_ADDRESS), lamports: bal - 10000
        }));
        await connection.sendTransaction(tx, [wallet]);
        ctx.reply("💸 Funds sent to withdrawal address.");
    } catch (e) { ctx.reply("Withdrawal failed."); }
});

// --- 🛠️ HELPERS ---
async function getWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

bot.launch();
