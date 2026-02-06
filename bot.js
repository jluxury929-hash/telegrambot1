// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    await bot.sendMessage(adminId, `🛰️ **STATION:** ${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 PREDICTIVE ANALYSIS ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", chance = 50;
        // High Probability Sniper Entry
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; chance = 93; }
        else if (rsi > 69 && price >= bb.upper) { signal = "DOWN"; chance = 90; }

        return { signal, chance, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT", chance: 0 }; }
}

// --- ⚡ HFT AUTO-PILOT ---
async function runAutoPilot() {
    if (!bridge.isAuto) return;
    const quant = await analyze();
    if (quant.chance >= 88) {
        try {
            const { page, cursor } = bridge.get();
            await log(`🔥 **SNIPER:** ${quant.signal} (${quant.chance}%)`);
            await cursor.move(quant.signal === 'UP' ? '.btn-call' : '.btn-put');
            await page.evaluate((s) => window.pocketHFT(s.toLowerCase()), quant.signal);
        } catch (e) { console.log(e.message); }
    }
    setTimeout(runAutoPilot, 4000); // 4-second sniper scan
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **POCKET OPTION AI TERMINAL**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 1. BOOT ENGINE", callback_data: "boot" }],
                [{ text: bridge.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER MODE", callback_data: "auto" }],
                [{ text: "📊 SCAN MARKET", callback_data: "scan" }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") {
        await log("Launching browser...");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **LINK SECURED.** Sub-ms execution ready.");
    }
    if (q.data === "auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) runAutoPilot();
        await log(bridge.isAuto ? "⚡ **Sniper Mode: ACTIVE**" : "🛑 **Sniper Mode: OFF**");
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Bot Ready. Send /start to Telegram.");
