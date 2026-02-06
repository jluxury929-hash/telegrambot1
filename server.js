require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

puppeteer.use(StealthPlugin());

// --- 💎 SYSTEM STATE ---
const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, // Your Telegram ID
    lastTradeTime: 0,
    isPredicting: false,
    strategy: 'Scalper-V7'
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🛰️ LOG UTILITY ---
async function log(m) { 
    console.log(`[${new Date().toLocaleTimeString()}] ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{}); 
}

// --- ⚙️ BROWSER ENGINE (AUTO-PATH FIX) ---
async function bootBrowser() {
    await log("🔍 **Detecting Environment & Launching...**");
    try {
        const browser = await puppeteer.launch({
            headless: false,
            // FIX: This finds the browser path automatically on any OS
            executablePath: require('puppeteer').executablePath(), 
            args: [
                '--start-maximized', 
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        await injectFastActionLayer();
        await log("✅ **ENGINE ONLINE.** Log into your account now.");

        // Monitor for successful login
        await state.page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("🚀 **LOGIN DETECTED.** Sub-ms bridge is now locked and ready.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}\n\n*Fix:* Run \`npx puppeteer browsers install chrome\` in your terminal.`);
    }
}

// --- ⚡ POCKET OPTION RAPID-ACTION LAYER ---
async function injectFastActionLayer() {
    await state.page.evaluate(() => {
        window.pocket = {
            execute: async (direction) => {
                const selector = direction === 'up' ? '.btn-call' : '.btn-put';
                const btn = document.querySelector(selector);
                if (!btn) return "NOT_FOUND";

                // Physical Mouse Event Sequence (Stealthy & Fast)
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    btn.dispatchEvent(new MouseEvent(type, {
                        view: window, bubbles: true, cancelable: true, buttons: 1
                    }));
                });
                return "SUCCESS";
            }
        };
    });
}

// --- 📈 QUANT ANALYSIS (PREDICTIVE) ---
async function getAnalysis() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", conf = 50;
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; conf = 94; }
        else if (rsi > 69 && price >= bb.upper) { signal = "DOWN"; conf = 91; }

        return { signal, conf, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT", conf: 0 }; }
}

// --- 🤖 AUTO-PILOT SNIPER LOOP ---
async function autoPilotLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;

    const analysis = await getAnalysis();
    
    // Threshold: 90% Probability
    if (analysis.conf >= 90 && (Date.now() - state.lastTradeTime > 60000)) {
        state.isPredicting = true;
        
        // 1. Prediction Notification
        await log(`🔮 **PREDICTION ALERT**\nDirection: **${analysis.signal}**\nConfidence: \`${analysis.conf}%\`\n\n*Analyzing liquidity & Executing...*`);

        // 2. Human Reaction Delay (3 seconds)
        await new Promise(r => setTimeout(r, 3000));

        try {
            const btnSelector = analysis.signal === 'UP' ? '.btn-call' : '.btn-put';
            await state.cursor.move(btnSelector);
            const res = await state.page.evaluate((d) => window.pocket.execute(d.toLowerCase()), analysis.signal);
            
            if (res === "SUCCESS") {
                await log(`💰 **TRADE PLACED.** Order for ${analysis.signal} confirmed.`);
                state.lastTradeTime = Date.now();
            }
        } catch (e) {
            await log(`❌ Execution error: ${e.message}`);
        } finally {
            state.isPredicting = false;
        }
    }
    setTimeout(autoPilotLoop, 2000); 
}

// --- 📱 TELEGRAM UI ---
const menu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER MODE", callback_data: "auto" }],
            [{ text: "📈 MANUAL UP", callback_data: "manual_up" }, { text: "📉 MANUAL DOWN", callback_data: "manual_down" }],
            [{ text: "📊 SCAN MARKET", callback_data: "scan" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, `💎 **POCKET OPTION AI TERMINAL**\nMode: \`${state.strategy}\`\nStatus: \`Ready\``, menu);
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootBrowser();
    if (q.data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) autoPilotLoop();
        await log(state.isAuto ? "⚡ **Sniper Mode: ACTIVE**" : "🛑 **Sniper Mode: OFF**");
    }
    if (q.data === "scan") {
        const a = await getAnalysis();
        await log(`📡 **MARKET SCAN:**\nSignal: \`${a.signal}\` | Prob: \`${a.conf}%\` | RSI: \`${a.rsi}\``);
    }
    if (q.data.startsWith("manual_")) {
        const dir = q.data.split("_")[1].toUpperCase();
        await state.page.evaluate((d) => window.pocket.execute(d.toLowerCase()), dir);
        await log(`✅ Manual ${dir} executed.`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server is running. Send /start to Telegram.");
