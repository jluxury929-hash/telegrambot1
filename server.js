require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');
const path = require('path');

puppeteer.use(StealthPlugin());

const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, 
    strategy: 'AI-EagleEye-V20-CaptchaSecure',
    lastTradeTime: 0,
    loggedIn: false,
    tempEmail: process.env.EMAIL || '',
    tempPass: process.env.PASS || ''
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- ⚙️ BROWSER ENGINE (Persistent Session) ---
async function bootEngine(queryId) {
    if (queryId) bot.answerCallbackQuery(queryId).catch(() => {});
    await log("🛡️ **Launching AI Engine...**");
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            userDataDir: path.join(__dirname, 'session_data'), 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.setViewport({ width: 1280, height: 800 });

        // Auto-Resume Check
        await state.page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'networkidle2' });

        if (state.page.url().includes('cabinet')) {
            await log("✅ **SESSION RESTORED.** Dashboard active.");
            state.loggedIn = true;
            state.isAuto = true;
            sniperLoop();
        } else {
            await log("🔑 **LOGIN NEEDED.** Use `/confirm` then `/sign_in`.");
            await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        }
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 🤖 THE "I AM NOT A ROBOT" COMMAND ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (!state.page) return;
    await log("🕵️ **AI: Scanning all frames for Captcha checkbox...**");
    
    try {
        // 1. Locate the Captcha Frame (Works for reCAPTCHA and hCaptcha)
        const frames = state.page.frames();
        const captchaFrame = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box'));

        if (!captchaFrame) {
            return await log("⚠️ **Captcha frame not found.** Make sure it's visible on the screen.");
        }

        // 2. Locate the checkbox selector within that frame
        const selector = '.recaptcha-checkbox-border, #checkbox, [role="checkbox"]';
        const checkbox = await captchaFrame.waitForSelector(selector, { visible: true, timeout: 8000 });

        // 3. Coordinate Mapping (Absolute Position)
        const frameEl = await captchaFrame.frameElement();
        const fBox = await frameEl.boundingBox();
        const cBox = await checkbox.boundingBox();

        if (fBox && cBox) {
            const targetX = fBox.x + cBox.x + cBox.width / 2;
            const targetY = fBox.y + cBox.y + cBox.height / 2;

            await log("🖱️ **Moving to Captcha with Human physics...**");
            
            // Safety: Reset mouse state
            await state.page.mouse.up();
            
            // Precision Glide & Click
            await state.cursor.click({ x: targetX, y: targetY });
            await log("✅ **Checkbox Toggled.** Use `/snap` to see the result.");
        }
    } catch (e) {
        await log(`❌ **Captcha Click Failed:** ${e.message}`);
    }
});

// --- 🖱️ SIGN-IN COMMAND ---
bot.onText(/\/sign_in/, async (msg) => {
    if (!state.page) return;
    await log("🖱️ **AI: Executing Sign-In...**");
    try {
        await state.page.mouse.up();
        const success = await state.page.evaluate(() => {
            const b = document.querySelector('button[type="submit"]');
            if (b) { b.scrollIntoView(); b.click(); return true; }
            return false;
        });
        if (success) await log("🚀 **Login clicked.** Waiting for redirect...");
    } catch (e) { await log("❌ Click failed."); }
});

// --- ⌨️ CREDENTIALS ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1].trim(); log("📧 Email stored."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1].trim(); log("🔑 Pass stored."); });

bot.onText(/\/confirm/, async () => {
    if (!state.page) return;
    await log("⌨️ **AI: Typing...**");
    try {
        await state.page.type('input[name="email"]', state.tempEmail, { delay: 100 });
        await state.page.type('input[name="password"]', state.tempPass, { delay: 100 });
        await log("✅ Credentials typed.");
    } catch (e) { await log("❌ Typing failed."); }
});

// --- 📈 SNIPER LOOP ---
async function sniperLoop() {
    if (!state.isAuto || !state.page) return;
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        if ((rsi < 31 || rsi > 69) && (Date.now() - state.lastTradeTime > 60000)) {
            const dir = rsi < 31 ? "Higher" : "Lower";
            await state.page.evaluate((d) => {
                const btn = Array.from(document.querySelectorAll('button, .btn')).find(b => b.innerText.includes(d));
                if (btn) btn.click();
            }, dir);
            state.lastTradeTime = Date.now();
            await log(`💰 **TRADE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 UI ---
bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootEngine(q.id);
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO AI SNIPER V20**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});
