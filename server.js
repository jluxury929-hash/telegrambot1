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
    strategy: 'AI-EagleEye-V21-ForceClick-Fixed',
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

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine(queryId) {
    if (queryId) bot.answerCallbackQuery(queryId).catch(() => {});
    await log("🛡️ **Launching Engine V21.1 (Click-Fix Edition)...**");
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            userDataDir: path.join(__dirname, 'session_data'), 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

        // Auto-Dashboard Sentinel
        setInterval(async () => {
            if (state.page && state.page.url().includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **DASHBOARD DETECTED!** AI loop starting...");
                state.isAuto = true;
                sniperLoop();
            }
        }, 3000);

        await log("✅ **ENGINE ONLINE.** Commands: `/email`, `/password`, `/confirm`, `/sign_in`.");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 🖱️ THE FINAL SIGN-IN FIX (Atomic Click) ---
bot.onText(/\/sign_in/, async (msg) => {
    if (!state.page) return;
    await log("🖱️ **AI: Attempting Atomic Sign-In...**");
    
    try {
        // Clear any stuck mouse state
        await state.page.mouse.up();
        
        const submitSelector = 'button[type="submit"]';
        const btn = await state.page.waitForSelector(submitSelector, { visible: true, timeout: 5000 });
        const box = await btn.boundingBox();

        if (box) {
            // Humanize coordinates
            const x = box.x + box.width / 2;
            const y = box.y + box.height / 2;

            // Move cursor humanly
            await state.cursor.moveTo({ x, y });
            
            // Execute physical click with manual down/up to ensure 'left' is pressed
            await state.page.mouse.move(x, y);
            await state.page.mouse.down({ button: 'left' });
            await new Promise(r => setTimeout(r, 150)); // Hold for 150ms
            await state.page.mouse.up({ button: 'left' });

            await log("🚀 **Atomic Click Triggered.**");
        }
    } catch (e) {
        await log("⚠️ Click failed. Falling back to **Deep-JS Event Dispatch**...");
        await state.page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]') || 
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Sign In'));
            if (btn) btn.click();
        });
    }
});

// --- 🤖 THE "I AM NOT A ROBOT" FIX (Frame-Bound) ---
bot.onText(/\/i_am_not_a_robot/, async () => {
    if (!state.page) return;
    await log("🕵️ **AI: Targeting Captcha Checkbox...**");
    try {
        const frames = state.page.frames();
        const f = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha'));
        const box = await f.waitForSelector('.recaptcha-checkbox-border, #checkbox');
        const b = await box.boundingBox();
        const fr = await f.frameElement();
        const fb = await fr.boundingBox();

        const x = fb.x + b.x + b.width / 2;
        const y = fb.y + b.y + b.height / 2;

        await state.page.mouse.up(); // Release stuck clicks
        await state.cursor.moveTo({ x, y });
        
        // Manual left-click injection to bypass 'left not pressed' errors
        await state.page.mouse.down({ button: 'left' });
        await new Promise(r => setTimeout(r, 100));
        await state.page.mouse.up({ button: 'left' });

        await log("✅ **Captcha Clicked successfully.**");
    } catch (e) { await log("❌ Captcha failed: " + e.message); }
});

// --- 📈 SNIPER LOOP & OTHERS ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1].trim(); log("📧 Email set."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1].trim(); log("🔑 Pass set."); });

bot.onText(/\/confirm/, async () => {
    if (!state.page) return;
    await log("⌨️ **Typing...**");
    try {
        await state.page.type('input[name="email"]', state.tempEmail, { delay: 100 });
        await state.page.type('input[name="password"]', state.tempPass, { delay: 100 });
        await log("✅ Typed.");
    } catch (e) { await log("❌ Type failed."); }
});

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
            await log(`💰 **AI SNIPE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootEngine(q.id);
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO AI SNIPER V21.1**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});
