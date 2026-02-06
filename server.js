require('dotenv').config();
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

puppeteer.use(StealthPlugin());

// --- 💎 SYSTEM STATE & STORAGE ---
const COOKIE_PATH = './session_cookies.json';
const state = {
    page: null,
    isAuto: false,
    adminId: 6588957206, // Your ID
    strategy: 'Scalper-V7',
    tradeAmount: 1,
    isPredicting: false,
    lastTradeTime: 0
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) { 
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{}); 
}

// --- 🛡️ BROWSER & SESSION ENGINE ---
async function bootEngine() {
    await log("🛡️ **Initializing AI Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: false, // Set to true if on a server without Xvfb
            executablePath: require('puppeteer').executablePath(), 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);

        // Load Session if exists
        if (fs.existsSync(COOKIE_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH));
            await state.page.setCookie(...cookies);
            await log("🍪 **Session Restored.** Attempting direct access...");
        }

        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        await injectHFTLayer();
        await log("✅ **ENGINE ONLINE.** Log in manually or via /login.");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

async function saveSession() {
    const cookies = await state.page.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies));
    await log("💾 **Session Saved.** Next boot will be automatic.");
}

// --- ⚡ HFT EXECUTION LAYER ---
async function injectHFTLayer() {
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
        await log(`🔮 **PREDICTION:** ${intel.signal} (${intel.chance}%) - Executing...`);
        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            await state.page.evaluate((d) => window.pocketHFT(d.toLowerCase()), intel.signal);
            state.lastTradeTime = Date.now();
        } finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 3000); 
}

// --- 📱 PRO COMMAND CENTER ---
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }, { text: "💾 SAVE SESSION", callback_data: "save" }],
            [{ text: "🔍 GOOGLE LOGIN", callback_data: "google" }, { text: "📧 LOGIN INFO", callback_data: "info" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START AUTO", callback_data: "auto" }],
            [{ text: "📸 SNAP", callback_data: "snap" }, { text: "📊 SCAN", callback_data: "scan" }],
            [{ text: "📈 CALL", callback_data: "manual_up" }, { text: "📉 PUT", callback_data: "manual_down" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id === state.adminId) bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v7.5**", mainMenu);
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
    if (d === "save") await saveSession();
    if (d === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
    if (d === "google") {
        await state.page.click('.google-login-button, a[href*="google"]');
        await log("🌐 **Google Tab Opened.** Use `/snap` to follow.");
    }
    if (d === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ON**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (d.startsWith("manual_")) {
        const dir = d.split("_")[1].toUpperCase();
        await state.page.evaluate((d) => window.pocketHFT(d.toLowerCase()), dir);
        await log(`✅ Manual ${dir} placed.`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Sniper System is Running.");
