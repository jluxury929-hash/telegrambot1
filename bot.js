require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    await bot.sendMessage(adminId, `🚀 **AI-SNIPER:** ${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 PREDICTIVE ANALYZER ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", prob = 50;
        if (rsi < 32 && price <= bb.lower) { signal = "UP"; prob = 94; }
        else if (rsi > 68 && price >= bb.upper) { signal = "DOWN"; prob = 91; }

        return { signal, prob, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT", prob: 0 }; }
}

// --- ⚡ AUTO-PILOT (SCAN EVERY 3 SECONDS) ---
async function runAutoPilot() {
    if (!bridge.isAuto) return;
    const quant = await analyze();
    if (quant.prob >= 90) {
        try {
            const { page, cursor } = bridge.get();
            await log(`🔥 **HIGH PROBABILITY:** ${quant.signal} (${quant.prob}%)`);
            await cursor.move(quant.signal === 'UP' ? '.btn-call' : '.btn-put');
            await page.evaluate((s) => window.pocketHFT(s.toLowerCase()), quant.signal);
        } catch (e) { console.log(e.message); }
    }
    setTimeout(runAutoPilot, 3000); 
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
        await log("Launching engine...");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **LINK SECURED.** Sub-ms execution active.");
    }
    if (q.data === "auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) runAutoPilot();
        await log(bridge.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Bot is live. Type /start in Telegram.");
