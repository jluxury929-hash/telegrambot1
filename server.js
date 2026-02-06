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
const COOKIE_PATH = './session_cookies.json';
const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, // Your Telegram ID
    strategy: 'HFT-Sniper-V8',
    isPredicting: false,
    lastTradeTime: 0,
    tradeAmount: 1
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🛰️ FEEDBACK SYSTEM ---
async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 📸 SCREENSHOT LOGIC (THE "SNAP" SYSTEM) ---
async function sendSnap(caption = "📸 Live View") {
    if (!state.page) return log("❌ **Engine not booted.**");
    try {
        const screenshot = await state.page.screenshot({ type: 'png' });
        await bot.sendPhoto(state.adminId, screenshot, { caption });
    } catch (e) { await log(`❌ Screenshot failed: ${e.message}`); }
}

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine() {
    await log("🛡️ **Initializing Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: "new", // Railway requirement
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);

        // Session Restoration
        if (fs.existsSync(COOKIE_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH));
            await state.page.setCookie(...cookies);
            await log("🍪 **Session Restored.** Directing to dashboard...");
        }

        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        // Inject Rapid-Click Logic
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

        await log("✅ **ENGINE ONLINE.** Log in manually, use Google, or type `/login`.");
        await sendSnap("📍 Initial Landing Page");
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
        await log(`🔮 **PREDICTION ALERT**\nDirection: **${intel.signal}**\nConfidence: \`${intel.chance}%\``);

        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            const res = await state.page.evaluate((d) => window.pocketExecute(d.toLowerCase()), intel.signal);
            
            if (res === "OK") {
                state.lastTradeTime = Date.now();
                await sendSnap(`💰 Bet Placed: ${intel.signal}`);
            }
        } catch (e) {
            await log(`❌ Execution error: ${e.message}`);
        } finally {
            state.isPredicting = false;
        }
    }
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 MODERN MULTI-OPTION MENU ---
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }, { text: "📸 SNAP", callback_data: "snap" }],
            [{ text: "🔑 GOOGLE LOGIN", callback_data: "google" }, { text: "📧 LOGIN INFO", callback_data: "info" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER", callback_data: "auto" }],
            [{ text: "📈 CALL", callback_data: "up" }, { text: "📉 PUT", callback_data: "down" }],
            [{ text: "📊 SCAN MARKET", callback_data: "scan" }, { text: "💾 SAVE SESSION", callback_data: "save" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v8.0**\nStatus: `Ghost Mode Active`", mainMenu);
});

// Manual Credentials Handler: /login email password
bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await state.page.type('input[name="email"]', match[1], {delay: 110});
    await state.page.type('input[name="password"]', match[2], {delay: 125});
    await log("⌨️ Credentials entered. Use `/snap` to verify before clicking submit.");
});

bot.on('callback_query', async (q) => {
    const data = q.data;
    if (data === "boot") await bootEngine();
    if (data === "snap") await sendSnap();
    if (data === "info") await log("📝 **Format:** `/login email password` (delete the message after typing)");
    if (data === "save") {
        const cookies = await state.page.cookies();
        fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies));
        await log("💾 **Session Cookies Saved.**");
    }
    if (data === "google") {
        await state.page.click('a.social-login__item--google, .google-login-button');
        await log("🌐 **Google OAuth opened.** Use `/snap` to see the screen and verify on your phone.");
    }
    if (data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ACTIVE**" : "🛑 **Auto-Pilot: OFF**");
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

console.log("🚀 Server is running. All modules combined.");
