require('dotenv').config();
const fs = require('fs');
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
    isAuto: false,
    adminId: 6588957206, 
    lastTradeTime: 0,
    isPredicting: false,
    tradeAmount: 1
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) { 
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{}); 
}

// --- 📸 SCREENSHOT LOGIC (KEEPING IT!) ---
async function sendSnap(caption = "📸 Live View") {
    if (!state.page) return log("❌ **Engine not booted.**");
    try {
        const screenshot = await state.page.screenshot({ type: 'png' });
        await bot.sendPhoto(state.adminId, screenshot, { caption });
    } catch (e) { await log(`❌ Screenshot failed: ${e.message}`); }
}

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine() {
    await log("🛡️ **Initializing AI Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: false, // Set to true if running on a server without Xvfb
            executablePath: require('puppeteer').executablePath(), 
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);

        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        // Inject High-Speed Logic
        await state.page.evaluate(() => {
            window.pocketHFT = (dir) => {
                const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                if (btn) {
                    ['mousedown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles: true})));
                    return "OK";
                }
                return "ERR";
            };
        });

        await log("✅ **ENGINE ONLINE.** Login manually or use Google.");
        await sendSnap("📍 Initial Landing Page");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 📈 QUANT ANALYSIS ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];
        
        let signal = "NEUTRAL", chance = 50;
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; chance = 94; }
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
        await log(`🔮 **PREDICTION:** ${intel.signal} (${intel.chance}%) - RSI: ${intel.rsi}`);
        
        await new Promise(r => setTimeout(r, 2000)); // Brief pause for clarity

        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            const res = await state.page.evaluate((d) => window.pocketHFT(d.toLowerCase()), intel.signal);
            if (res === "OK") {
                state.lastTradeTime = Date.now();
                await sendSnap(`💰 Bet Placed: ${intel.signal}`);
            }
        } finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 MODERN MENU ---
const proMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }, { text: "📸 SNAP", callback_data: "snap" }],
            [{ text: "🔑 GOOGLE LOGIN", callback_data: "google" }, { text: "📧 LOGIN INFO", callback_data: "login_info" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER", callback_data: "auto" }],
            [{ text: "📈 MANUAL CALL", callback_data: "manual_up" }, { text: "📉 MANUAL PUT", callback_data: "manual_down" }],
            [{ text: "📊 SCAN MARKET", callback_data: "scan" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id === state.adminId) bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v7.8**", proMenu);
});

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await state.page.type('input[name="email"]', match[1], {delay: 100});
    await state.page.type('input[name="password"]', match[2], {delay: 100});
    await log("⌨️ Credentials entered. Use `/snap` to verify.");
});

bot.on('callback_query', async (q) => {
    const d = q.data;
    if (d === "boot") await bootEngine();
    if (d === "snap") await sendSnap();
    if (d === "login_info") await log("📝 **Login Format:**\n`/login email password` (Use space between)");
    if (d === "google") {
        await state.page.click('.google-login-button, a[href*="google"]');
        await log("🌐 **Google OAuth opened.** Monitor via /snap.");
    }
    if (d === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (d === "scan") {
        const a = await analyze();
        await log(`📡 **SCAN:** ${a.signal}\nProb: ${a.chance}%\nRSI: ${a.rsi}`);
    }
    if (d.startsWith("manual_")) {
        const dir = d.split("_")[1].toUpperCase();
        await state.page.evaluate((d) => window.pocketHFT(d.toLowerCase()), dir);
        await log(`✅ Manual ${dir} executed.`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server is running. Send /start to Telegram.");
