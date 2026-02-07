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
    strategy: 'AI-EagleEye-V21-ForceClick',
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
    await log("🛡️ **Launching Engine V21 (Force-Click Edition)...**");
    
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

// --- 🖱️ THE FINAL SIGN-IN FIX (Force-Dispatch) ---
bot.onText(/\/sign_in/, async (msg) => {
    if (!state.page) return;
    await log("🖱️ **AI: Attempting Deep-Force Sign-In...**");
    
    try {
        // 1. Release all virtual mouse buttons and clear focus
        await state.page.mouse.up();
        await state.page.evaluate(() => window.getSelection().removeAllRanges());

        // 2. Identify the button using multiple attributes
        const submitSelector = 'button[type="submit"], .btn-primary[type="submit"], button:contains("Sign In")';
        
        // 3. Force-scroll and Focus
        await state.page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]') || 
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Sign In'));
            if (btn) {
                btn.scrollIntoView();
                btn.focus();
            }
        });

        // 4. THE ULTIMATE FIX: Dispatch events directly to the button
        const success = await state.page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]') || 
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Sign In'));
            if (btn) {
                const events = ['mousedown', 'mouseup', 'click'];
                events.forEach(name => {
                    const ev = new MouseEvent(name, { bubbles: true, cancelable: true, view: window });
                    btn.dispatchEvent(ev);
                });
                return true;
            }
            return false;
        });

        if (success) {
            await log("🚀 **Deep-Click Dispatched.** If you see a blue highlight, the AI is bypassing the overlay.");
        } else {
            throw new Error("Button not found in DOM");
        }

    } catch (e) {
        await log(`❌ **Force-Click Failed:** ${e.message}. Trying standard click...`);
        await state.page.click('button[type="submit"]').catch(() => {});
    }
});

// --- 🤖 CAPTCHA, CREDENTIALS & SNIPER ---
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

bot.onText(/\/i_am_not_a_robot/, async () => {
    if (!state.page) return;
    try {
        const frames = state.page.frames();
        const f = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha'));
        const box = await f.waitForSelector('.recaptcha-checkbox-border, #checkbox');
        const b = await box.boundingBox();
        const fr = await f.frameElement();
        const fb = await fr.boundingBox();
        await state.page.mouse.up();
        await state.cursor.click({ x: fb.x + b.x + b.width/2, y: fb.y + b.y + b.height/2 });
        await log("✅ Captcha clicked.");
    } catch (e) { await log("❌ Captcha failed."); }
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
    bot.sendMessage(msg.chat.id, "💎 **PRO AI SNIPER V21**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});
