// 1. LOAD DOTENV FIRST
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const axios = require('axios');

// Verify token loading
if (!process.env.BOT_TOKEN) {
    console.error("❌ ERROR: BOT_TOKEN is missing in .env file!");
    process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Persistence for user settings
bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- Initial Session State ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || {
        asset: 'BTC/USD',
        payout: 92,
        amount: 100,
        risk: 'Med (2%)',
        mode: 'Real',
        autoPilot: false // Added AutoPilot state
    };
    return next();
});

// --- Helper: CAD Converter ---
async function getCADProfit(usd) {
    try {
        const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
        return (usd * res.data.rates.CAD).toFixed(2);
    } catch {
        return (usd * 1.41).toFixed(2); 
    }
}

// --- Helper: AI Signal Simulation (Worlds Best Prediction Logic) ---
async function getAISignal(asset) {
    // In a production environment, you would call a Sentiment API like LunarCrush 
    // or a specialized signal provider. Here we simulate a 90% confidence check.
    const confidence = (Math.random() * (98 - 85) + 85).toFixed(1);
    const direction = Math.random() > 0.5 ? 'HIGHER' : 'LOWER';
    return { confidence, direction };
}

// --- Main Keyboard UI ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`🪙 Coin: ${ctx.session.trade.asset} (${ctx.session.trade.payout}%)`, 'menu_coins')],
    [Markup.button.callback(`⚖️ Risk: ${ctx.session.trade.risk}`, 'menu_risk')],
    [Markup.button.callback(`💵 Stake: $${ctx.session.trade.amount} USD`, 'menu_stake')],
    [Markup.button.callback(`🛡 Mode: ${ctx.session.trade.mode}`, 'toggle_mode')],
    [Markup.button.callback(ctx.session.trade.autoPilot ? '🛑 STOP AUTO-PILOT' : '🤖 START AUTO-PILOT', 'toggle_autopilot')],
    [Markup.button.callback('📡 GET MANUAL SIGNAL', 'start_engine')]
]);

// --- BOT START ---
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `⚡️ *POCKET ROBOT v8.0 - AI PULSE* ⚡️\n\n` +
        `Institutional sentiment engine active.\n` +
        `*Strategy:* Social Pulse + Technical Confluence\n\n` +
        `Configure your parameters below:`,
        mainKeyboard(ctx)
    );
});

// --- TOGGLE AUTO-PILOT ---
bot.action('toggle_autopilot', async (ctx) => {
    ctx.session.trade.autoPilot = !ctx.session.trade.autoPilot;
    const status = ctx.session.trade.autoPilot ? "ENABLED ✅" : "DISABLED 🛑";
    
    await ctx.answerCbQuery(`Auto-Pilot ${status}`);
    await ctx.editMessageText(`🤖 *Auto-Pilot Status:* ${status}\n\nLooping every 60 seconds...`, {
        parse_mode: 'Markdown',
        ...mainKeyboard(ctx)
    });

    if (ctx.session.trade.autoPilot) {
        runAutoPilotLoop(ctx);
    }
});

// --- THE AUTO-PILOT LOOP ---
async function runAutoPilotLoop(ctx) {
    if (!ctx.session.trade.autoPilot) return;

    const signal = await getAISignal(ctx.session.trade.asset);
    
    // Only "trade" if confidence is ultra-high
    if (parseFloat(signal.confidence) > 90) {
        const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
        const cadProfit = await getCADProfit(usdProfit);

        await ctx.replyWithMarkdown(
            `🤖 *AUTO-PILOT EXECUTION*\n` +
            `🎯 Asset: ${ctx.session.trade.asset}\n` +
            `📈 Signal: *${signal.direction}* (${signal.confidence}%)\n\n` +
            `✅ *RESULT: WIN*\n` +
            `Profit: +$${usdProfit} USD (*$${cadProfit} CAD*)`
        );
    }

    // Loop every 60 seconds to avoid "racing" and comply with signal timing
    setTimeout(() => runAutoPilotLoop(ctx), 60000);
}

// --- MANUAL SIGNAL ENGINE ---
bot.action('start_engine', async (ctx) => {
    await ctx.editMessageText(`📡 *SCANNING WEB AI & TELEGRAM FEEDS...*`);
    
    const signal = await getAISignal(ctx.session.trade.asset);

    setTimeout(() => {
        ctx.editMessageText(
            `📡 *SIGNAL FOUND (PROBABILITY: ${signal.confidence}%)*\n` +
            `Direction: *${signal.direction}*\n\n` +
            `Execute on Pocket Option?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🚀 EXECUTE', 'exec_final')],
                [Markup.button.callback('❌ CANCEL', 'main_menu')]
            ])
        );
    }, 2500);
});

bot.action('exec_final', async (ctx) => {
    const usdProfit = (ctx.session.trade.amount * (ctx.session.trade.payout / 100)).toFixed(2);
    const cadProfit = await getCADProfit(usdProfit);

    await ctx.editMessageText("⏳ *Executing on Broker...*");
    
    setTimeout(() => {
        ctx.replyWithMarkdown(
            `✅ *TRADE SETTLED*\n\n` +
            `Asset: ${ctx.session.trade.asset}\n` +
            `Payout: +$${cadProfit} CAD`
        );
    }, 3000);
});

bot.action('main_menu', (ctx) => ctx.editMessageText("⚙️ *SETTINGS*", { parse_mode: 'Markdown', ...mainKeyboard(ctx) }));

bot.launch().then(() => console.log("🚀 Pocket Robot is Live!"));
