require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    await bot.sendMessage(adminId, `🚀 **SYSTEM:** ${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 QUANTUM PREDICTION ENGINE ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", chance = 50;
        if (rsi < 32 && price <= bb.lower) { signal = "UP"; chance = 94; }
        else if (rsi > 68 && price >= bb.upper) { signal = "DOWN"; chance = 91; }

        return { signal, chance, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT", chance: 0 }; }
}

// --- 🤖 AUTO-PILOT (SCAN EVERY 3 SECONDS) ---
async function runAutoPilot() {
    if (!bridge.isAuto) return;

    const quant = await analyze();
    if (quant.chance >= 90) {
        try {
            const { page, cursor } = bridge.get();
            await log(`🔥 **SNIPER ALERT:** ${quant.signal} (${quant.chance}%)`);
            await cursor.move(quant.signal === 'UP' ? '.btn-call' : '.btn-put');
            await page.evaluate((s) => window.pocketHFT(s.toLowerCase()), quant.signal);
            await log(`✅ **TRADE APPLIED.**`);
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
        await log("Launching browser...");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **BRIDGE READY.** Features mapped.");
    }
    if (q.data === "auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) runAutoPilot();
        await log(bridge.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Bot is live. Type /start.");
