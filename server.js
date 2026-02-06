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
    adminId: 6588957206, 
    strategy: 'HFT-Sniper-V8.9',
    isPredicting: false,
    lastTradeTime: 0,
    tempEmail: '',
    tempPass: '',
    loggedIn: false
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🛰️ NAVIGATION WATCHER (Login Notifier) ---
async function startWatchingNavigation() {
    if (!state.page) return;
    const checkInterval = setInterval(async () => {
        try {
            const url = state.page.url();
            if (url.includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **LOGIN SUCCESS!** I have detected the trading dashboard.");
                await injectTradingLogic();
                await log("🚀 **Trading Engine Ready.** Click 'START SNIPER' to begin.");
                clearInterval(checkInterval);
            }
        } catch (e) {}
    }, 2000);
}

// --- ⚡ TRADING LOGIC INJECTION ---
async function injectTradingLogic() {
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
}

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine() {
    await log("🛡️ **Launching Ultra-Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--remote-debugging-port=9222',
                '--remote-debugging-address=0.0.0.0',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        
        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        await injectTradingLogic();
        startWatchingNavigation();

        await log("✅ **ENGINE ONLINE.**\n\n1. `/email` & `/password` -> `/confirm` \n2. `/i_am_not_a_robot` (if needed) \n3. `/sign_in` to finish login.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 🖱️ NON-LINEAR SIGN-IN CLICKER ---
bot.onText(/\/sign_in/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await log("🖱️ **Moving to Sign-In button...**");
    try {
        const submitSelector = 'button[type="submit"]';
        const button = await state.page.waitForSelector(submitSelector, { visible: true, timeout: 5000 });
        
        if (button) {
            // Get button location
            const box = await button.boundingBox();
            const x = box.x + box.width / 2 + (Math.random() * 10 - 5);
            const y = box.y + box.height / 2 + (Math.random() * 6 - 3);

            // Move in non-linear curved path
            await state.cursor.moveTo({ x, y });
            
            // Human-like click duration
            await state.page.mouse.down();
            await new Promise(r => setTimeout(r, Math.random() * 80 + 40));
            await state.page.mouse.up();
            
            await log("🚀 **Sign-In clicked.** Waiting for dashboard redirect...");
        }
    } catch (e) {
        await log(`❌ **Sign-In Error:** ${e.message}`);
    }
});

// --- 🤖 THE CAPTCHA SNIPER ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await log("🕵️ **Locating Captcha Checkbox...**");
    try {
        const captchaFrame = state.page.frames().find(f => 
            f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box')
        );

        if (!captchaFrame) return await log("⚠️ **Captcha not found.**");

        const checkboxSelector = '.recaptcha-checkbox-border, #checkbox';
        const checkboxHandle = await captchaFrame.waitForSelector(checkboxSelector, { timeout: 5000 });

        if (checkboxHandle) {
            const box = await checkboxHandle.boundingBox();
            const targetX = box.x + (box.width / 2) + (Math.random() * 4 - 2);
            const targetY = box.y + (box.height / 2) + (Math.random() * 4 - 2);

            await state.cursor.moveTo({ x: targetX, y: targetY });
            await state.page.mouse.down();
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
            await state.page.mouse.up();
            await log("✅ **Checkbox clicked.**");
        }
    } catch (e) { await log(`❌ **Precision Click Failed.**`); }
});

// --- 🔑 CREDENTIALS ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1]; log("📧 Email set."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1]; log("🔑 Password set."); });

bot.onText(/\/confirm/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    if (!state.tempEmail || !state.tempPass) return log("❌ Set credentials first.");
    
    await log("⌨️ **Typing credentials...**");
    try {
        await state.page.type('input[name="email"]', state.tempEmail, { delay: 150 });
        await state.page.type('input[name="password"]', state.tempPass, { delay: 180 });
        await log("🚀 **Typed.** Check captcha, then use `/sign_in`.");
    } catch (e) { await log("❌ Fields not found."); }
});

// --- 📈 ANALYSIS ENGINE ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];
        let signal = (rsi < 31 && price <= bb.lower) ? "UP" : (rsi > 69 && price >= bb.upper) ? "DOWN" : "NEUTRAL";
        return { signal, chance: 90, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT" }; }
}

// --- 🤖 AUTO-PILOT ---
async function sniperLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;
    const intel = await analyze();
    
    if (intel.signal !== "NEUTRAL" && (Date.now() - state.lastTradeTime > 60000)) {
        state.isPredicting = true;
        await log(`🔮 **PREDICTION:** ${intel.signal}`);
        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            await state.page.evaluate((d) => window.pocketExecute(d.toLowerCase()), intel.signal);
            state.lastTradeTime = Date.now();
            await log("💰 **TRADE PLACED.**");
        } catch (e) { console.error(e); } finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM INTERFACE ---
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER", callback_data: "auto" }],
            [{ text: "📸 SNAP", callback_data: "snap" }, { text: "📊 SCAN", callback_data: "scan" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v8.9**\nCommands:\n- `/confirm` (Type info)\n- `/i_am_not_a_robot` (Click box)\n- `/sign_in` (Submit login)", mainMenu);
});

bot.on('callback_query', async (q) => {
    const data = q.data;
    if (data === "boot") await bootEngine();
    if (data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ON**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
    if (data === "scan") {
        const a = await analyze();
        await log(`📡 **SCAN:** ${a.signal} | RSI: ${a.rsi}`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server running. Non-linear Sign-in & Notifier Active.");
