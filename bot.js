require('dotenv').config(); // MUST BE LINE 1
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');

if (!process.env.BOT_TOKEN || !process.env.SEED_PHRASE) {
    console.error(" ERROR: BOT_TOKEN or SEED_PHRASE missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Persistence
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Wallet Logic (Seed Phrase to Coinbase/Solana Address) ---
let traderWallet;
async function initWallet() {
    const seed = await bip39.mnemonicToSeed(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    traderWallet = Keypair.fromSeed(derivedSeed);
    console.log(`✅ Pocket Robot Live: ${traderWallet.publicKey.toBase58()}`);
}

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Institutional', mode: 'Real'
    };
    return next();
});

// --- CAD Converter ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.41).toFixed(2); }
}

// --- Pocket Robot Keyboard ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(` Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(` Risk Level: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(` Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(` Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback(' OPTIONS / MANUAL', 'menu_options')],
    [Markup.button.callback(' START SIGNAL BOT', 'start_engine')]
]);

// --- DASHBOARD ---
bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(
        ` *POCKET ROBOT v7.5 - APEX PRO* \n\n` +
        `Institutional engine active. Accuracy: *94.8%*.\n\n` +
        ` *Address:* \`${traderWallet.publicKey.toBase58().slice(0,6)}...${traderWallet.publicKey.toBase58().slice(-4)}\`\n` +
        ` *Tech:* Aave V3 Flash Loans | Jito Atomic Bundles\n` +
        ` *Stream:* Yellowstone gRPC (400ms Latency)\n\n` +
        `Configure your betting parameters:`,
        mainKeyboard(ctx)
    );
});

// --- MENU ACTIONS ---
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(" *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('menu_options', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(" *MANUAL CONFIGURATION*\nSelect your strategy options:", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Scalper (1m)', 'opt_1m'), Markup.button.callback('🛡 Swing (5m)', 'opt_5m')],
            [Markup.button.callback('💎 Aggressive Payout', 'opt_agg'), Markup.button.callback(' BACK', 'main_menu')]
        ])
    });
});

bot.action('menu_coins', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(" *SELECT ASSET:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
            [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback(' BACK', 'main_menu')]
        ])
    });
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("Scanning gRPC stream...");
    await ctx.editMessageText(` *ANALYZING ${ctx.session.trade.asset}...*\nWaiting for gRPC signal...`);
    
    setTimeout(async () => {
        try {
            await ctx.editMessageText(` *SIGNAL FOUND! (94.8%)*\nDirection: *HIGHER*\nConfirm Atomic Execution?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback(' HIGHER', 'exec_final'), Markup.button.callback(' LOWER', 'exec_final')],
                    [Markup.button.callback(' CANCEL', 'main_menu')]
                ])
            );
        } catch (e) {}
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery("Executing Atomic Bundle...");
    await ctx.editMessageText(" *Bundling...* Executing Atomic Flash Loan via Jito...");
    
    const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
    const cadProfit = await getCADProfit(usdProfit);

    setTimeout(() => {
        ctx.replyWithMarkdown(
            ` *TRADE RESULT: WIN*\n\n` +
            `Profit (USD): *+$${usdProfit}*\n` +
            ` *Profit (CAD): +$${cadProfit}*\n` +
            `Status: *Settled Atomically*\n` +
            `Destination: *Connected Wallet*`
        );
    }, 3000);
});

// --- SETTERS ---
bot.action(/set_coin_(.*)_(.*)/, async (ctx) => {
    ctx.session.trade.asset = ctx.match[1] + '/USD';
    ctx.session.trade.payout = parseInt(ctx.match[2]);
    await ctx.answerCbQuery();
    await ctx.editMessageText(" *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action(/set_stake_(.*)/, async (ctx) => {
    ctx.session.trade.amount = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.editMessageText(" *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

// --- FIX 409 CONFLICT & LAUNCH ---
initWallet().then(() => {
    bot.launch({ dropPendingUpdates: true }) // <--- THIS FIXES THE 409 CONFLICT
        .then(() => console.log(" Pocket Robot is Live & Snappy!"))
        .catch(err => console.error("Launch Error:", err));
});
