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
    await bot.sendMessage(adminId, `🛰️ **STATION LOG:**\n${msg}`, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 📈 PREDICTIVE ENGINE ---
async function getPrediction(asset = 'BTCUSDT') {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${asset}&interval=1m&limit=30`);
        const closes = res.data.map(d => parseFloat(d[4]));
        
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const sma = TA.sma({ values: closes, period: 10 }).pop();
        const lastPrice = closes[closes.length - 1];

        let decision = "NEUTRAL";
        let reason = `RSI: ${rsi.toFixed(2)} | Price: ${lastPrice}`;

        if (rsi < 35 && lastPrice > sma) decision = "HIGHER 📈";
        else if (rsi > 65 && lastPrice < sma) decision = "LOWER 📉";

        return { decision, reason };
    } catch (e) { return { decision: "ERROR", reason: e.message }; }
}

// --- 📱 UI & COMMANDS ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    const menu = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 1. LAUNCH ENGINE", callback_data: "launch" }],
                [{ text: "🧠 2. GET PREDICTION", callback_data: "predict" }],
                [{ text: "📈 CALL", callback_data: "up" }, { text: "📉 PUT", callback_data: "down" }]
            ]
        }
    };
    bot.sendMessage(msg.chat.id, "💎 **AI PREDICTIVE TERMINAL**\nMode: `PocketOption Feature-Link`", menu);
});

bot.on('callback_query', async (q) => {
    const { data, message } = q;

    if (data === "launch") {
        await log("🚀 **Launching Stealth Browser...**");
        try {
            const page = await startEngine();
            await log("🔑 **WAITING FOR LOGIN...** Please authorize in Chrome.");
            await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
            await log("✅ **LINK ESTABLISHED.** Pocket Option features are now mapped.");
        } catch (e) { await log(`❌ **CRITICAL ERROR:** ${e.message}`); }
    }

    if (data === "predict") {
        await log("📡 **Analyzing Market Volatility...**");
        const p = await getPrediction();
        const advice = p.decision === "NEUTRAL" ? "⚠️ **Wait for better entry.**" : `🔥 **STRATEGY:** Choose **${p.decision}**`;
        await bot.sendMessage(adminId, `🎯 **PREDICTION ENGINE**\nAsset: \`BTC/USD\`\nDecision: \`${p.decision}\`\nData: \`${p.reason}\`\n\n${advice}`, { parse_mode: 'Markdown' });
    }

    if (data === "up" || data === "down") {
        try {
            const { page, cursor } = bridge.get();
            const action = data === "up" ? "call" : "put";
            await log(`🕹️ **Action:** Moving human-cursor to **${action.toUpperCase()}**...`);
            await cursor.move(action === 'call' ? '.btn-call' : '.btn-put');
            await page.evaluate((a) => window.pocketControl.click(a), action);
            await log(`✅ **TRADE SENT.** Verify your screen for the active order.`);
        } catch (e) { await log(`❌ **BRIDGE FAILED:** ${e.message}`); }
    }
    bot.answerCallbackQuery(q.id);
});
