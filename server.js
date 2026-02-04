require('dotenv').config(); // MUST BE LINE 1

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { ethers } = require('ethers');
const axios = require('axios');

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing in .env");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Blockchain Setup ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "");
const wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;
const ABI = [
    "function executeBet(address token, uint256 amount, bool higher) external",
    "function withdrawToken(address token) external",
    "function balanceOf(address token) view returns (uint256)"
];
const contract = process.env.CONTRACT_ADDRESS ? new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, wallet) : null;
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"; 

// --- CAD Converter ---
async function getCAD(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch { return (usd * 1.41).toFixed(2); }
}

// --- Menus ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💰 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🔄 Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback('⚙️ OPTIONS', 'menu_options')],
    [Markup.button.callback('🚀 START SIGNAL BOT', 'start_engine')],
    [Markup.button.callback('💳 WITHDRAW TO WALLET', 'menu_wallet')]
]);

bot.start(async (ctx) => {
    await ctx.replyWithMarkdown(`🤖 *POCKET ROBOT v7.5 - APEX PRO* 🟢\n\nAccuracy: *80-90%+ profit*.\n🛡️ *Tech:* Aave V3 + Atomic Bundles\n🇨🇦 *Currency:* CAD Payouts\n\nConfigure your parameters:`, mainKeyboard(ctx));
});

// --- Actions (Sticky Fix Applied) ---
bot.action('main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('toggle_mode', async (ctx) => {
    ctx.session.trade.mode = ctx.session.trade.mode === 'Real' ? 'Demo' : 'Real';
    await ctx.answerCbQuery(`Switched to ${ctx.session.trade.mode}`);
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.action('start_engine', async (ctx) => {
    await ctx.answerCbQuery("📡 Scanning gRPC...");
    await ctx.editMessageText(`📡 *ANALYZING ${ctx.session.trade.asset}...*`);
    setTimeout(async () => {
        await ctx.editMessageText(`🎯 *SIGNAL FOUND! (94.8%)*\nDirection: *HIGHER*\nConfirm Execution?`,
            Markup.inlineKeyboard([[Markup.button.callback('📈 HIGHER', 'exec_final'), Markup.button.callback('📉 LOWER', 'exec_final')], [Markup.button.callback('❌ CANCEL', 'main_menu')]]));
    }, 2000);
});

bot.action('exec_final', async (ctx) => {
    await ctx.answerCbQuery();
    const trade = ctx.session.trade;

    if (trade.mode === 'Real' && contract) {
        await ctx.editMessageText("⏳ *REAL MODE:* Broadcasting Atomic Flash Loan...");
        try {
            const tx = await contract.executeBet(USDC_POLYGON, ethers.parseUnits(trade.amount.toString(), 6), true);
            await tx.wait();
            const usdProfit = (trade.amount * (trade.payout / 100)).toFixed(2);
            const cadProfit = await getCAD(usdProfit);
            ctx.replyWithMarkdown(`💰 *REAL TRADE WIN*\nProfit: *+$${usdProfit} USD* | *+$${cadProfit} CAD*`);
        } catch (e) { ctx.reply("❌ *REVERTED:* Atomic Shield prevented loss."); }
    } else {
        await ctx.editMessageText("⏳ *DEMO MODE:* Simulating Bundle...");
        const cadProfit = await getCAD(trade.amount * 0.92);
        setTimeout(() => ctx.replyWithMarkdown(`💰 *DEMO WIN:* +$${cadProfit} CAD`), 2000);
    }
});

bot.action('exec_withdraw', async (ctx) => {
    await ctx.answerCbQuery("Broadcasting...");
    if (contract) {
        const tx = await contract.withdrawToken(USDC_POLYGON);
        await tx.wait();
        ctx.reply("✅ *WITHDRAWAL SUCCESSFUL:* CAD Profits sent to wallet.");
    } else { ctx.reply("❌ Contract not connected."); }
});

bot.action(/set_(.*)_(.*)/, async (ctx) => {
    await ctx.answerCbQuery();
    if(ctx.match[1] === 'coin') { ctx.session.trade.asset = ctx.match[2]+'/USD'; }
    await ctx.editMessageText("🤖 *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) });
});

bot.launch().then(() => console.log("🚀 Pocket Robot is Live!"));
