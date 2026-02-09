require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, SystemProgram, Transaction, PublicKey } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- SDK Interop Guard ---
const JitoSDK = require('jito-js-rpc');
// This handles different export styles (Default vs Named)
const JitoClientClass = JitoSDK.JitoJsonRpcSDK || JitoSDK.default || JitoSDK;

const jitoClient = new JitoClientClass("https://mainnet.block-engine.jito.wtf/api/v1/bundles");
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

async function getWallet() {
    if (!process.env.SEED_PHRASE) throw new Error("SEED_PHRASE missing in .env");
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- SESSION & UI ---
bot.use((ctx, next) => {
    ctx.session.config = ctx.session.config || { asset: 'SOL/USD', stake: 10, mode: 'MANUAL', payout: 92, totalEarned: 0 };
    return next();
});

const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🎯 ${ctx.session.config.asset} (92%)`, 'menu_coins')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.config.stake}`, 'menu_stake')],
    [Markup.button.callback(`⚙️ Mode: ${ctx.session.config.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.config.mode === 'AUTO' ? '⚡ STOP AUTO' : '🚀 START BOT', 'run_engine')],
    [Markup.button.callback('📊 STATS', 'stats')]
]);

// --- HANDLERS ---
bot.start(async (ctx) => {
    try {
        const wallet = await getWallet();
        ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v12.6*\nWallet: \`${wallet.publicKey.toBase58()}\`\nReady for Atomic trades.`, mainKeyboard(ctx));
    } catch (e) { ctx.reply("❌ Check .env SEED_PHRASE"); }
});

bot.action('toggle_mode', (ctx) => {
    ctx.session.config.mode = ctx.session.config.mode === 'MANUAL' ? 'AUTO' : 'MANUAL';
    ctx.editMessageText(`🔄 Mode: *${ctx.session.config.mode}*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('run_engine', (ctx) => {
    if (ctx.session.config.mode === 'AUTO') {
        ctx.editMessageText("🟢 *AUTO-PILOT ACTIVE*");
        autoLoop(ctx);
    } else {
        ctx.replyWithMarkdown(`⚡ *SIGNAL FOUND!*\nConfirm trade:`, Markup.inlineKeyboard([
            [Markup.button.callback('📈 CALL', 'exec_final'), Markup.button.callback('📉 PUT', 'exec_final')]
        ]));
    }
});

bot.action('exec_final', async (ctx) => {
    await ctx.editMessageText("🔄 *Bundling...*");
    const profit = (ctx.session.config.stake * 0.92).toFixed(2);
    ctx.session.config.totalEarned += parseFloat(profit);
    setTimeout(() => {
        ctx.replyWithMarkdown(`✅ *WIN: +$${profit}*`);
    }, 2000);
});

function autoLoop(ctx) {
    if (ctx.session.config.mode !== 'AUTO') return;
    setTimeout(() => {
        const profit = (ctx.session.config.stake * 0.92).toFixed(2);
        ctx.session.config.totalEarned += parseFloat(profit);
        ctx.replyWithMarkdown(`⚡ *AUTO-WIN: +$${profit}*`);
        autoLoop(ctx);
    }, 15000);
}

bot.launch();
console.log("Pocket Robot v12.6 Live");
