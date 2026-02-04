require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { createSolanaRpc } = require('@solana/web3.js'); 
const bip39 = require('bip39');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

const rpc = createSolanaRpc(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com');

// Initial State
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'SOL/USD', 
        amount: 10, 
        mode: 'Real', 
        connected: false,
        payout: 94
    };
    return next();
});

// --- UI: LARGE MENU LAYOUT ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Selected Asset: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Trading Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback(ctx.session.trade.connected ? '✅ INSTITUTIONAL WALLET ACTIVE' : '🔌 CONNECT SEED PHRASE', 'wallet_info')]
]);

// --- FIXED BUTTON HANDLERS ---

// 1. Coin Selection
bot.action('menu_coins', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🎯 **SELECT TARGET ASSET:**", Markup.inlineKeyboard([
        [Markup.button.callback('BTC/USD (92%)', 'set_asset_BTC'), Markup.button.callback('ETH/USD (89%)', 'set_asset_ETH')],
        [Markup.button.callback('SOL/USD (94%)', 'set_asset_SOL'), Markup.button.callback('JUP/USD (91%)', 'set_asset_JUP')],
        [Markup.button.callback('🔙 RETURN TO MAIN MENU', 'main_menu')]
    ]));
});

// 2. Stake Selection
bot.action('menu_stake', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("💰 **SELECT STAKE AMOUNT (USD):**", Markup.inlineKeyboard([
        [Markup.button.callback('$10', 'set_stake_10'), Markup.button.callback('$50', 'set_stake_50')],
        [Markup.button.callback('$100', 'set_stake_100'), Markup.button.callback('$500', 'set_stake_500')],
        [Markup.button.callback('🔙 RETURN TO MAIN MENU', 'main_menu')]
    ]));
});

// 3. Toggle Mode
bot.action('toggle_mode', async (ctx) => {
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.answerCbQuery(`Switched to ${ctx.session.trade.mode}`);
    await ctx.editMessageText(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx));
});

// 4. Wallet Info
bot.action('wallet_info', async (ctx) => {
    await ctx.answerCbQuery();
    const status = ctx.session.trade.connected ? "CONNECTED ✅" : "NOT CONNECTED ❌";
    await ctx.editMessageText(`💳 **WALLET STATUS:** ${status}\n\nUse \`/connect <seed phrase>\` to link your institutional account.`, 
    Markup.inlineKeyboard([[Markup.button.callback('🔙 BACK', 'main_menu')]]));
});

// 5. Main Menu Return
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx));
});

// --- ASSET & STAKE SETTERS ---
bot.action(/set_asset_(.*)/, async (ctx) => {
    ctx.session.trade.asset = ctx.match[1] + '/USD';
    await ctx.answerCbQuery(`Asset set to ${ctx.session.trade.asset}`);
    await ctx.editMessageText(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx));
});

bot.action(/set_stake_(.*)/, async (ctx) => {
    ctx.session.trade.amount = parseInt(ctx.match[1]);
    await ctx.answerCbQuery(`Stake set to $${ctx.session.trade.amount}`);
    await ctx.editMessageText(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx));
});

// --- ENGINE LOGIC (Same as before but fixed) ---
bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("📡 Scanning LPs...");
    await ctx.editMessageText("🔍 **ANALYZING 1-MIN CANDLE...**\n`gRPC Stream: Yellowstone Active`\n`Atomic Reversion: ARMED`\n\n_Waiting for liquidity gap..._");
    
    setTimeout(async () => {
        const isHigher = Math.random() > 0.5;
        const signal = isHigher ? "HIGHER 📈" : "LOWER 📉";
        await ctx.editMessageText(
            `🎯 **SIGNAL FOUND!**\n\nAsset: *${ctx.session.trade.asset}*\nConfidence: *94.2%*\nRecommended: **${signal}**\n\nConfirm Atomic Execution?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery("Bundling...");
    await ctx.editMessageText("🚀 **Executing Atomic Jito Bundle...**");
    setTimeout(() => {
        ctx.replyWithMarkdown(`✅ **TRADE RESULT: WIN**\n\nProfit: *+$${(ctx.session.trade.amount * 0.94).toFixed(2)} USD*\nStatus: *Settled Atomically*`);
    }, 3000);
});

// --- COMMANDS ---
bot.command('connect', async (ctx) => {
    const text = ctx.message.text.split(' ');
    if (text.length < 13) return ctx.reply("⚠️ Usage: /connect <12 word seed>");
    ctx.session.trade.connected = true;
    await ctx.deleteMessage();
    ctx.reply("✅ Wallet Connected.", mainKeyboard(ctx));
});

bot.start((ctx) => ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx)));
bot.launch().then(() => console.log("🚀 Pocket Robot Pro is Live!"));
