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
    strategy: 'HFT-Sniper',
    isPredicting: false,
    lastTradeTime: 0
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) { 
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{}); 
}

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine() {
    await log("🛡️ **Initializing Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: "new", // Railway requires headless for stability, or use Xvfb
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        
        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        // Inject the Rapid-Click Logic
        await state.page.evaluate(() => {
            window.pocketExecute = (dir) => {
                const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                if (btn) {
                    ['mousedown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles: true})));
                    return "OK";
                }
                return "ERR";
            };
        });

        await log("✅ **ENGINE ONLINE.** Type `/snap` to view the login screen.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 📈 PREDICTIVE ANALYSIS (RSI + BB) ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", chance = 50;
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; chance = 93; }
        else if (rsi > 69 && price >= bb.upper) { signal = "DOWN"; chance = 91; }

        return { signal, chance, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT", chance: 0 }; }
}

// --- 🤖 SNIPER AUTO-PILOT ---
async function sniperLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;

    const intel = await analyze();
    
    if (intel.chance >= 90 && (Date.now() - state.lastTradeTime > 60000)) {
        state.isPredicting = true;
        await log(`🔮 **PREDICTION ALERT**\nDirection: **${intel.signal}**\nConfidence: \`${intel.chance}%\`\n\n*Executing trade...*`);

        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            const res = await state.page.evaluate((d) => window.pocketExecute(d.toLowerCase()), intel.signal);
            
            if (res === "OK") {
                state.lastTradeTime = Date.now();
                await log(`✅ **TRADE PLACED.** Order for ${intel.signal} is live.`);
            }
        } catch (e) {
            await log(`❌ Execution error: ${e.message}`);
        } finally {
            state.isPredicting = false;
        }
    }
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM INTERFACE ---
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER", callback_data: "auto" }],
            [{ text: "📸 SCREENSHOT", callback_data: "snap" }, { text: "📊 SCAN", callback_data: "scan" }],
            [{ text: "📈 CALL", callback_data: "up" }, { text: "📉 PUT", callback_data: "down" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v7.1**\nReady for sub-ms execution.", mainMenu);
});

bot.on('callback_query', async (q) => {
    const data = q.data;
    if (data === "boot") await bootEngine();
    if (data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (data === "snap") {
        if (!state.page) return bot.answerCallbackQuery(q.id, { text: "Engine not booted!" });
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic, { caption: "📸 Live View" });
    }
    if (data === "scan") {
        const a = await analyze();
        await log(`📡 **MARKET SCAN:**\nSignal: \`${a.signal}\` | Prob: \`${a.chance}%\` | RSI: \`${a.rsi}\``);
    }
    if (data === "up" || data === "down") {
        await state.page.evaluate((d) => window.pocketExecute(d), data);
        await log(`✅ Manual ${data.toUpperCase()} placed.`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server is running. Send /start to Telegram.");
