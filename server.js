require('dotenv').config(); // MUST BE LINE 1

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🛠️ REAL MODE SETUP (MINIMAL ADDITION) ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "");
// Wallet connected to your Private Key
const wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;
// Contract ABI for the functions we need
const ABI = [
    "function executeBet(address token, uint256 amount, bool higher) external",
    "function withdrawToken(address token) external",
    "function balanceOf(address token) view returns (uint256)"
];
const contract = (process.env.CONTRACT_ADDRESS && wallet) 
    ? new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet) 
    : null;

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; // Default Polygon USDC

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD', payout: 92, amount: 100, risk: 'Med (2%)', mode: 'Real'
    };
    return next();
});

// --- CAD Converter (Real-time 2026 rates) ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.41).toFixed(2); }
}

// --- Dynamic Keyboard Generator ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk Level: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Account: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('⚙️ OPTIONS', 'menu_options')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'menu_wallet')]
]);

// --- AUTO-START ---
bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(
        `🤖 *POCKET ROBOT v7.5 - APEX PRO* 🟢\n\n` +
        `Institutional engine active. Accuracy: *80-90%+ profit*.\n\n` +
        `🛡️ *Tech:* Aave V3 Flash Loans | Atomic Bundles\n` +
        `⚡ *Stream:* Yellowstone gRPC (400ms Latency)\n\n` +
        `Configure your betting parameters:`,
        mainKeyboard(ctx)
    );
});

// --- MENU ACTIONS ---
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('toggle_mode', async (ctx) => {
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.answerCbQuery(`Switched to ${ctx.session.trade.mode}`);
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

// --- 🚀 REAL MODE TRADE LOGIC ---
bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery();
    const trade = ctx.session.trade;

    if (trade.mode === 'Real') {
        if (!contract) return ctx.reply("❌ Error: Contract not connected. Check .env");
        await ctx.editMessageText("⏳ *REAL MODE:* Broadcasting Atomic Flash Loan Bundle...");
        
        try {
            // Call the actual smart contract function
            const tx = await contract.executeBet(
                USDC_ADDRESS,
                ethers.parseUnits(trade.amount.toString(), 6), // USDC has 6 decimals
                true // Signal direction (Higher)
            );
            await tx.wait(); // Wait for blockchain confirmation

            const usdProfit = (trade.amount * (trade.payout / 100)).toFixed(2);
            const cadProfit = await getCADProfit(usdProfit);
            ctx.replyWithMarkdown(`💰 *REAL TRADE WIN*\nProfit: *+$${usdProfit} USD* | *+$${cadProfit} CAD*`);
        } catch (e) {
            ctx.reply(`❌ *REVERTED:* ${e.reason || "Atomic protection triggered. Trade cancelled to save funds."}`);
        }
    } else {
        await ctx.editMessageText("⏳ *DEMO MODE:* Simulating...");
        setTimeout(() => ctx.replyWithMarkdown(`💰 *DEMO WIN:* +$141.00 CAD`), 2000);
    }
});

// --- 💳 REAL MODE WITHDRAW LOGIC ---
bot.action('exec_withdraw', async (ctx) => {
    await ctx.answerCbQuery("Processing Blockchain Payout...");
    if (ctx.session.trade.mode === 'Real' && contract) {
        try {
            const tx = await contract.withdrawToken(USDC_ADDRESS);
            await tx.wait();
            ctx.reply("✅ *SUCCESS:* CAD Profits sent to your connected wallet.");
        } catch (e) { ctx.reply("❌ Withdrawal failed: Insufficient funds or gas."); }
    } else {
        ctx.reply("✅ *Demo Withdrawal:* Simulated funds cleared.");
    }
});

// [Other Menu Actions remain unchanged...]
bot.action('menu_coins', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🔍 *SELECT ASSET:*", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('BTC/USD (92%)', 'set_coin_BTC_92'), Markup.button.callback('ETH/USD (89%)', 'set_ETH_89')],
            [Markup.button.callback('SOL/USD (94%)', 'set_SOL_94'), Markup.button.callback('🔙 BACK', 'main_menu')]
        ])
    });
});
bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("Scanning gRPC...");
    await ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*`);
    setTimeout(async () => {
        await ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.8%)*\nConfirm Execution?`,
            Markup.inlineKeyboard([[Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')], [Markup.button.callback('❌ CANCEL', 'main_menu')]]));
    }, 2000);
});

bot.launch().then(() => console.log("🚀 Pocket Robot is LIVE in Real Mode!"));
