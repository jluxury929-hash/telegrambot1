require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    await bot.sendMessage(adminId, `🛰️ **AUTO-PILOT LOG:**\n${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 📈 QUANT ANALYSIS ENGINE ---
async function analyzeMarket() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50`);
        const closes = res.data.map(d => parseFloat(d[4]));
        
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const lastPrice = closes[closes.length - 1];

        let score = 50; // Base probability
        let signal = "NEUTRAL";

        if (rsi < 30 && lastPrice <= bb.lower) { score = 88; signal = "UP"; }
        if (rsi > 70 && lastPrice >= bb.upper) { score = 91; signal = "DOWN"; }

        return { signal, score, data: `RSI: ${rsi.toFixed(2)} | Price: ${lastPrice}` };
    } catch (e) { return { signal: "ERROR", score: 0 }; }
}

// --- 📱 STRATEGY MENU ---
const getMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 1. LAUNCH BROWSER", callback_data: "launch" }],
            [{ text: bridge.isAuto ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "toggle_auto" }],
            [{ text: "🧠 GET 90% SIGNAL", callback_data: "predict" }],
            [{ text: "📈 MANUAL CALL", callback_data: "up" }, { text: "📉 MANUAL PUT", callback_data: "down" }]
        ]
    }
});

// --- 🤖 AUTO-PILOT LOOP ---
async function autoPilotLoop() {
    if (!bridge.isAuto) return;

    const analysis = await analyzeMarket();
    if (analysis.score >= 85) {
        await log(`🔥 **High Probability Found (${analysis.score}%)**\nSignal: ${analysis.signal}\nExecuting trade...`);
        try {
            const { page, cursor } = bridge.get();
            await cursor.move(analysis.signal === 'UP' ? '.btn-call' : '.btn-put');
            await page.evaluate((s) => window.pocket.click(s.toLowerCase()), analysis.signal);
            await log(`✅ **Auto-Trade Implemented.** Next scan in 2 mins.`);
        } catch (e) { await log(`❌ Auto-Pilot Failed: ${e.message}`); }
    }
    setTimeout(autoPilotLoop, 120000); // Scan every 2 minutes
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **PREDICTIVE STEALTH TERMINAL**\nStrategy: `Bollinger + RSI Mean Reversion`", getMenu());
});

bot.on('callback_query', async (q) => {
    if (q.data === "launch") {
        await log("🚀 **Launching Engine...**");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **BRIDGE ACTIVE.** Features mapped.");
    }

    if (q.data === "toggle_auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) autoPilotLoop();
        bot.editMessageText(`💎 **TERMINAL**\nAuto-Pilot: \`${bridge.isAuto ? 'ACTIVE' : 'OFF'}\``, 
            { chat_id: q.message.chat.id, message_id: q.message.message_id, ...getMenu() });
        await log(bridge.isAuto ? "🤖 **Auto-Pilot Started.** Searching for trades..." : "🛑 **Auto-Pilot Stopped.**");
    }

    if (q.data === "predict") {
        const p = await analyzeMarket();
        await bot.sendMessage(adminId, `🎯 **PREDICTION:** ${p.signal}\n🔥 **Probability:** ${p.score}%\n📊 **Data:** \`${p.data}\``);
    }

    if (q.data === "up" || q.data === "down") {
        try {
            const { page, cursor } = bridge.get();
            await cursor.move(q.data === 'up' ? '.btn-call' : '.btn-put');
            await page.evaluate((d) => window.pocket.click(d), q.data);
            await log(`✅ **Manual Bet Implemented.**`);
        } catch (e) { await log(`❌ ${e.message}`); }
    }
    bot.answerCallbackQuery(q.id);
});
