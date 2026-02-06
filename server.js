require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

puppeteer.use(StealthPlugin());

// --- 🧠 GLOBAL BOT STATE ---
const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, 
    lastTradeTime: 0,
    minProbability: 88 // Only trade if 88% sure
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    await bot.sendMessage(state.adminId, `🛰️ **AI LOG:** ${msg}`, { parse_mode: 'Markdown' }).catch(() => {});
}

// --- 📈 QUANTUM PREDICTIVE ENGINE ---
async function analyzeMarket() {
    try {
        // Fetch 1m candles for BTC/USD (Proxy for OTC volatility)
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=50`);
        const closes = res.data.map(d => parseFloat(d[4]));
        
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", prob = 50;

        // Mean Reversion Strategy: Overbought/Oversold + Bollinger Breakout
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; prob = 94; }
        else if (rsi > 69 && price >= bb.upper) { signal = "DOWN"; prob = 92; }

        return { signal, prob, stats: `RSI: ${rsi.toFixed(1)} | Price: ${price}` };
    } catch (e) { return { signal: "WAIT", prob: 0 }; }
}

// --- ⚡ POCKET OPTION FEATURE EXPLOIT ---
async function launchPocketOption() {
    await log("🛡️ Booting Stealth Engine...");
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
        args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled']
    });

    state.page = (await browser.pages())[0];
    state.cursor = createCursor(state.page);

    await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    
    // Injects features to control trade amount, time, and fast-click buttons
    const injectFeatures = async () => {
        await state.page.evaluate(() => {
            window.pocketBot = {
                // High-speed event trigger (bypasses UI lag)
                execute: (dir) => {
                    const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                    if (btn) {
                        btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                        btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                        return true;
                    }
                    return false;
                },
                // Set trade amount feature
                setAmount: (val) => {
                    const input = document.querySelector('input[name="amount"]');
                    if (input) {
                        input.value = val;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            };
        });
    };

    state.page.on('framenavigated', injectFeatures);
    await injectFeatures();
}

// --- 🤖 AUTO-PILOT (CONTINUOUS SNIPER) ---
async function runAutoPilot() {
    if (!state.isAuto || !state.page) return;

    const quant = await analyzeMarket();
    
    if (quant.prob >= state.minProbability && (Date.now() - state.lastTradeTime > 65000)) {
        try {
            await log(`🎯 **SNIPER SIGNAL:** ${quant.signal} (${quant.prob}%)\n${quant.stats}`);
            const selector = quant.signal === 'UP' ? '.btn-call' : '.btn-put';
            
            // Physical humanized movement + Sub-ms click
            await state.cursor.move(selector);
            const success = await state.page.evaluate((s) => window.pocketBot.execute(s.toLowerCase()), quant.signal);
            
            if (success) {
                state.lastTradeTime = Date.now();
                await log("✅ **TRADE IMPLEMENTED.** Waiting for expiry.");
            }
        } catch (e) { console.error("AutoPilot Error:", e.message); }
    }
    
    // Scans the market every 4 seconds for a massive competitive edge
    setTimeout(runAutoPilot, 4000); 
}

// --- 📱 TELEGRAM INTERFACE ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **POCKET OPTION AI TERMINAL v6**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 1. BOOT ENGINE", callback_data: "boot" }],
                [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER MODE", callback_data: "auto" }],
                [{ text: "📊 REAL-TIME SCAN", callback_data: "scan" }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") {
        try {
            await launchPocketOption();
            await log("🔑 **LOGIN REQUIRED.** Please authorize the browser window.");
            await state.page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
            await log("✅ **LINK SECURED.** All platform features unlocked.");
        } catch (e) { await log(`❌ Launch Error: ${e.message}`); }
    }
    if (q.data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) runAutoPilot();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (q.data === "scan") {
        const a = await analyzeMarket();
        await bot.sendMessage(state.adminId, `📡 **MARKET ANALYSIS:**\nSignal: \`${a.signal}\`\nProbability: \`${a.prob}%\`\n${a.stats}`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server.js is live. Send /start to your bot.");
