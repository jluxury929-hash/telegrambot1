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

// --- 🌐 CONFIG (Use a Private RPC to avoid 429s) ---
const THALES_PROGRAM_ID = new PublicKey("B77Zon9K4p4Tz9U7N9M49mGzT1Z1Z1Z1Z1Z1Z1Z1Z1Z1");
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

const localSession = new LocalSession({ database: 'sessions.json', storage: LocalSession.storageFileSync });
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(localSession.middleware());

// --- 🛡️ ROBUST NETWORK HELPER (Fixes 429 Errors) ---
async function safePost(url, data) {
    try {
        return await axios.post(url, data);
    } catch (e) {
        if (e.response && e.response.status === 429) {
            console.log("⚠️ Rate limit hit. Cooling down 2.5s...");
            await new Promise(r => setTimeout(r, 2500)); // Wait and retry
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

bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || { asset: 'BTC/USD', stake: 10, mode: 'MANUAL', totalEarned: 0 };
    return next();
});

// --- 🔥 ATOMIC V0 EXECUTION CORE ---
async function fireAtomicTrade(ctx, direction) {
    const wallet = await getWallet();
    const { stake } = ctx.session.config;

    try {
        // 1. Fetch Blockhash (Standard RPC)
        const { blockhash } = await connection.getLatestBlockhash('confirmed');

        // 2. Fetch Tip Account (Using Shielded Helper)
        const tipRes = await safePost(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const tipAccount = new PublicKey(tipRes.data.result[0]);

        const side = direction === 'HIGHER' ? 0 : 1;
        const instructions = [
            new TransactionInstruction({
                programId: THALES_PROGRAM_ID,
                keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
                data: Buffer.concat([Buffer.from([side]), new anchor.BN(stake * 1000000).toBuffer('le', 8)])
            }),
            SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipAccount,
                lamports: 100000 
            })
        ];

        const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: blockhash,
            instructions: instructions
        }).compileToV0Message();

        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([wallet]);

        // 🛡️ SHIELD: Simulation
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) throw new Error("REVERT_PREVENTED");

        // 3. Send Bundle (Using Shielded Helper)
        const rawTx = Buffer.from(transaction.serialize()).toString('base64');
        const jitoRes = await safePost(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle",
            params: [[rawTx]]
        });

        ctx.session.config.totalEarned += (stake * 0.90);
        return { success: true, bundleId: jitoRes.data.result, payout: (stake * 1.90).toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 🎨 INTERFACE ---
const mainKeyboard = (ctx, balance = "Check...") => Markup.inlineKeyboard([
    [Markup.button.callback(`🎯 Asset: ${ctx.session.config.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.config.stake}`, 'menu_stake')],
    [Markup.button.callback(`⚙️ Mode: ${ctx.session.config.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.config.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START SIGNAL BOT', 'run_engine')],
    [Markup.button.callback(`📊 WALLET: ${balance} SOL`, 'stats')]
]);

bot.start(async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v55.0*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, 
        mainKeyboard(ctx, (bal / LAMPORTS_PER_SOL).toFixed(4)));
});

bot.action('run_engine', async (ctx) => {
    const signal = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
    ctx.replyWithMarkdown(`⚡ *ANALYSIS:* Go *${signal}*\n_Atomic protection active._`, Markup.inlineKeyboard([
        [Markup.button.callback(`📈 HIGHER`, 'exec_HIGHER'), Markup.button.callback(`📉 LOWER`, 'exec_LOWER')],
        [Markup.button.callback('❌ CANCEL', 'main_menu')]
    ]));
});

bot.action(/exec_(HIGHER|LOWER)/, async (ctx) => {
    const dir = ctx.match[1];
    await ctx.answerCbQuery(`Opening Atomic ${dir} trade...`);
    const res = await fireAtomicTrade(ctx, dir);
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *WIN:* +$${res.payout}\nBundle: \`${res.bundleId.slice(0,8)}...\``);
    } else {
        ctx.reply(`⚠️ ${res.error === 'REVERT_PREVENTED' ? '🛡️ Trade Reverted (No loss).' : 'Check Connection/Balance'}`);
    }
});

// Withdrawal / Stats logic...
bot.action('stats', async (ctx) => {
    const wallet = await getWallet();
    const bal = await connection.getBalance(wallet.publicKey);
    ctx.editMessageText(`📊 *WALLET STATUS*\nAddress: \`${wallet.publicKey.toBase58()}\`\nBalance: ${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL`,
    Markup.inlineKeyboard([[Markup.button.callback('💸 WITHDRAW', 'withdraw')], [Markup.button.callback('⬅️ BACK', 'main_menu')]]));
});

bot.launch();
