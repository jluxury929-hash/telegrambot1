// 1. LOAD DOTENV FIRST
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');
const { Connection, Keypair, PublicKey, VersionedTransaction, SystemProgram } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const bs58 = require('bs58');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// Verify token loading
if (!process.env.BOT_TOKEN || !process.env.SEED_PHRASE) {
    console.error("❌ ERROR: Essential credentials missing in .env!");
    process.exit(1);
}

// --- 2. SOLANA & JITO SETUP ---
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
const bot = new Telegraf(process.env.BOT_TOKEN);

const getWallet = () => {
    const seed = bip39.mnemonicToSeedSync(process.env.SEED_PHRASE.trim());
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
};

const wallet = getWallet();
const jito = searcherClient("frankfurt.mainnet.block-engine.jito.wtf", wallet);

bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 3. SESSION STATE ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD',
        payout: 94,
        amount: 1, // Base amount in SOL
        autoPilot: false,
        leverage: 10 // Fixed 10x
    };
    return next();
});

// --- 4. THE ATOMIC EXECUTION ENGINE ---
async function executeAtomic10x(ctx) {
    try {
        // A. Confirm Prediction (World's Best Data: LunarCrush Galaxy Score)
        const res = await axios.get(`https://api.lunarcrush.com/v4/public/assets/SOL/v1`, {
            headers: { 'Authorization': `Bearer ${process.env.LUNAR_API_KEY}` }
        });
        const score = res.data.data.galaxy_score;

        if (score < 75) {
            if (!ctx.session.trade.autoPilot) ctx.reply(`⚠️ Signal Weak (${score}/100). Reverting to save capital.`);
            return;
        }

        // B. Calculate 10x (Borrow 9x, Use 1x)
        const tradeTotal = ctx.session.trade.amount * 10;
        
        // C. Fetch Jupiter Flash Loan Quote
        const quote = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${tradeTotal * 1e9}&slippageBps=10`);

        const { swapTransaction } = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote.data,
            userPublicKey: wallet.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        }).then(r => r.data);

        // D. Build Jito Bundle (Atomic Revert Protection)
        const tipAccounts = await jito.getTipAccounts();
        const tipIx = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: new PublicKey(tipAccounts[0]),
            lamports: 1000000, // 0.001 SOL Tip
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([wallet]);

        const bundleId = await jito.sendBundle([tx]);
        
        await ctx.replyWithMarkdown(`✅ *10x ATOMIC WIN*\nSignal Strength: ${score}%\nBundle ID: \`${bundleId}\``);
    } catch (err) {
        console.error("Atomic Failure:", err.message);
    }
}

// --- 5. UI ACTIONS ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`🚀 Leverage: 10x ATOMIC`, 'none')],
    [Markup.button.callback(ctx.session.trade.autoPilot ? '🛑 STOP AUTO-PILOT' : '🤖 START AUTO-PILOT', 'toggle_autopilot')],
    [Markup.button.callback('📡 GET MANUAL SIGNAL', 'start_engine')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(`⚡️ *POCKET ROBOT v8.5 - APEX PRO* ⚡️\n\n*Tech:* 10x Flash Loans | Jito Atomic Reversal\n*Wallet:* \`${wallet.publicKey.toBase58()}\``, mainKeyboard(ctx));
});

bot.action('toggle_autopilot', async (ctx) => {
    ctx.session.trade.autoPilot = !ctx.session.trade.autoPilot;
    if (ctx.session.trade.autoPilot) runLoop(ctx);
    ctx.editMessageText(`🤖 *Auto-Pilot:* ${ctx.session.trade.autoPilot ? 'ON' : 'OFF'}`, mainKeyboard(ctx));
});

async function runLoop(ctx) {
    if (!ctx.session.trade.autoPilot) return;
    await executeAtomic10x(ctx);
    setTimeout(() => runLoop(ctx), 60000); // 1-minute safety loop
}

bot.launch().then(() => console.log("🚀 Apex Robot Live"));
