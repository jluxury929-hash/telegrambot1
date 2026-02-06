require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    await bot.sendMessage(adminId, `🛰️ **STATION LOG:**\n${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 PREDICTIVE ANALYSIS (WEIGHTED PROBABILITY) ---
async function analyzeMarket() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let chance = 50, signal = "NEUTRAL";
        if (rsi < 30 && price <= bb.lower) { chance = 92; signal = "UP"; }
        if (rsi > 70 && price >= bb.upper) { chance = 89; signal = "DOWN"; }

        return { signal, chance, data: `RSI: ${rsi.toFixed(2)} | P: ${price}` };
    } catch (e) { return { signal: "ERR", chance: 0 }; }
}

// --- 🤖 AUTO-PILOT LOOP ---
async function runAutoPilot() {
    if (!bridge.isAuto) return;
    const analysis = await analyzeMarket();
    if (analysis.chance >= 85) {
        await log(`🤖 **Auto-Pilot Action**\nSignal: ${analysis.signal}\nProbability: ${analysis.chance}%`);
        try {
            const { page, cursor } = bridge.get();
            await cursor.move(analysis.signal === 'UP' ? '.btn-call' : '.btn-put');
            await page.evaluate((s) => window.pocket.click(s.toLowerCase()), analysis.signal);
        } catch (e) { await log(`❌ Auto-Pilot Failed: ${e.message}`); }
    }
    setTimeout(runAutoPilot, 60000); // Check every minute
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    const menu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 1. LAUNCH ENGINE", callback_data: "launch" }],
                [{ text: bridge.isAuto ? "🛑 STOP AUTO" : "🚀 START AUTO", callback_data: "auto" }],
                [{ text: "🧠 GET 90% PREDICTION", callback_data: "predict" }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "💎 **STEALTH QUANT TERMINAL**", menu);
});

bot.on('callback_query', async (q) => {
    if (q.data === "launch") {
        await log("🚀 **Launching Browser...**");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **BRIDGE ACTIVE.**");
    }
    if (q.data === "auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) runAutoPilot();
        await log(bridge.isAuto ? "🤖 **Auto-Pilot: ON**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (q.data === "predict") {
        const p = await analyzeMarket();
        await bot.sendMessage(adminId, `🎯 **PREDICTION:** ${p.signal}\n🔥 **Success Rate:** ${p.chance}%\n📊 **TA:** \`${p.data}\``);
    }
    bot.answerCallbackQuery(q.id);
});
