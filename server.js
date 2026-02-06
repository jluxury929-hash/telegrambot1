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
    strategy: 'HFT-Sniper-V10-Final',
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

// --- 🛰️ NAVIGATION WATCHER (Auto-Start Logic) ---
async function startWatchingNavigation() {
    if (!state.page) return;
    const checkInterval = setInterval(async () => {
        try {
            const url = state.page.url();
            // Detect if we are in the cabinet/trading room
            if (url.includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **DASHBOARD DETECTED!** Preparing engine...");
                
                await injectTradingLogic();
                
                // --- ⚡ AUTOMATIC START ---
                state.isAuto = true; 
                sniperLoop(); 
                await log("🚀 **AUTO-PILOT ENGAGED.** Trading has started automatically.");
                
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

        await log("✅ **ENGINE ONLINE.**\n\nCommands:\n- `/email` & `/password` \n- `/confirm` (Type info)\n- `/sign_in` (Precision Login)\n- `/refresh` (Reset Page)");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 🔄 REFRESH COMMAND ---
bot.onText(/\/refresh/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await log("🔄 **Refreshing page and re-injecting logic...**");
    try {
        await state.page.reload({ waitUntil: 'networkidle2' });
        await injectTradingLogic();
        await log("✅ **Refresh complete.** Current URL: " + state.page.url());
    } catch (e) {
        await log("❌ Refresh failed: " + e.message);
    }
});

// --- 🖱️ HUMANIZED SIGN-IN (FIXED FOR DASHBOARD REDIRECT) ---
bot.onText(/\/sign_in/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await log("🖱️ **Initiating Humanized Sign-In...**");
    try {
        const submitSelector = 'button[type="submit"]';
        await state.page.waitForSelector(submitSelector, { visible: true, timeout: 5000 });
        
        // Move to button
        await state.cursor.click(submitSelector, {
            hesitate: Math.random() * 400 + 200,
            waitForClick: Math.random() * 100 + 50
        });

        await log("🚀 **Sign-In clicked.** Waiting for redirect to finish...");
        
        // Wait for the URL change or the dashboard to load
        await state.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
            log("⚠️ Navigation taking longer than usual. Check `/snap`.");
        });

    } catch (e) {
        await log(`❌ **Sign-In Error:** ${e.message}`);
    }
});

// --- 🤖 CAPTCHA CLICKER ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    try {
        const captchaFrame = state.page.frames().find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha'));
        if (captchaFrame) {
            const checkbox = await captchaFrame.waitForSelector('.recaptcha-checkbox-border, #checkbox');
            const box = await checkbox.boundingBox();
            await state.cursor.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
            await checkbox.click();
            await log("✅ **Checkbox clicked.**");
        }
    } catch (e) { await log(`❌ Captcha Click Failed.`); }
});

// --- 🔑 CREDENTIALS ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1]; log("📧 Email set."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1]; log("🔑 Password set."); });

bot.onText(/\/confirm/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    await state.page.type('input[name="email"]', state.tempEmail, { delay: 150 });
    await state.page.type('input[name="password"]', state.tempPass, { delay: 180 });
    await log("🚀 **Typed.** Use `/sign_in`.");
});

// --- 📈 ANALYSIS & AUTO-PILOT ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];
        let signal = (rsi < 31 && price <= bb.lower) ? "UP" : (rsi > 69 && price >= bb.upper) ? "DOWN" : "NEUTRAL";
        return { signal, rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT" }; }
}

async function sniperLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;
    const intel = await analyze();
    if (intel.signal !== "NEUTRAL" && (Date.now() - state.lastTradeTime > 60000)) {
        state.isPredicting = true;
        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            await state.page.evaluate((d) => window.pocketExecute(d.toLowerCase()), intel.signal);
            state.lastTradeTime = Date.now();
            await log(`💰 **TRADE:** ${intel.signal}`);
        } catch (e) {} finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM UI ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER FINAL**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
                [{ text: "🔄 REFRESH", callback_data: "refresh" }],
                [{ text: "📸 SNAP", callback_data: "snap" }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootEngine();
    if (q.data === "refresh") {
        await state.page.reload();
        await log("🔄 Refreshed.");
    }
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server running. Auto-Dashboard Start Active.");
