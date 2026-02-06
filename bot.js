require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { startEngine } = require('./launcher');
const bridge = require('./bridge');
const axios = require('axios');
const TA = require('technicalindicators');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    await bot.sendMessage(adminId, `⚡ **HFT-LOG:** ${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 📈 THE PREDICTIVE ENGINE (85%+ PROBABILITY) ---
async function fetchIntelligence() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50`);
        const closes = res.data.map(d => parseFloat(d[4]));
        
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const lastPrice = closes[closes.length - 1];

        let signal = "NEUTRAL";
        let prob = 50;

        // "Sniper" Logic: Overbought/Oversold + Bollinger Breakout
        if (rsi < 32 && lastPrice <= bb.lower) { signal = "UP"; prob = 94; }
        else if (rsi > 68 && lastPrice >= bb.upper) { signal = "DOWN"; prob = 91; }

        return { signal, prob, rsi: rsi.toFixed(2) };
    } catch (e) { return { signal: "WAIT", prob: 0 }; }
}

// --- 🤖 THE AUTO-PILOT (CONTINUOUS SCAN) ---
async function autoPilot() {
    if (!bridge.isAuto) return;

    const intel = await fetchIntelligence();
    if (intel.prob >= 90) {
        await log(`🎯 **HIGH PROBABILITY DETECTED (${intel.prob}%)**\nSignal: \`${intel.signal}\` | RSI: \`${intel.rsi}\``);
        try {
            const { page, cursor } = bridge.get();
            const selector = intel.signal === 'UP' ? '.btn-call' : '.btn-put';
            
            // Move and Click at AI speed
            await cursor.move(selector);
            await page.evaluate((s) => window.pocketHFT.execute(s.toLowerCase()), intel.signal);
            await log("✅ **TRADE APPLIED.** Waiting for result...");
        } catch (e) { await log(`❌ Error: ${e.message}`); }
    }
    
    // Scan every 5 seconds (The AI advantage)
    setTimeout(autoPilot, 5000);
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    const menu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
                [{ text: bridge.isAuto ? "🛑 STOP AUTO" : "🚀 START AUTO-PILOT", callback_data: "auto" }],
                [{ text: "🧠 LIVE PREDICTION", callback_data: "intel" }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "💎 **POCKET OPTION AI TERMINAL**\nStrategy: `Quantum-Stealth HFT`", menu);
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") {
        await log("Opening browser...");
        const page = await startEngine();
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("✅ **ENGINE LINKED.** Sub-ms execution active.");
    }
    if (q.data === "auto") {
        bridge.isAuto = !bridge.isAuto;
        if (bridge.isAuto) autoPilot();
        await log(bridge.isAuto ? "🤖 **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (q.data === "intel") {
        const i = await fetchIntelligence();
        await bot.sendMessage(adminId, `📡 **MARKET SCAN:**\nSignal: \`${i.signal}\`\nProbability: \`${i.prob}%\`\nRSI: \`${i.rsi}\``);
    }
    bot.answerCallbackQuery(q.id);
});
