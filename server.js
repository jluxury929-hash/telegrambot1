require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

// Initialize Stealth
puppeteer.use(StealthPlugin());

// --- 💎 SYSTEM STATE ---
const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, 
    strategy: 'AI-EagleEye-V17-Final',
    isPredicting: false,
    lastTradeTime: 0,
    tempEmail: process.env.EMAIL || '',
    tempPass: process.env.PASS || '',
    loggedIn: false
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 👁️ AI EAGLE-EYE VISION LAYER ---
const VisionAI = {
    locateElement: async (page, targetLabel) => {
        return await page.evaluate((label) => {
            const elements = Array.from(document.querySelectorAll('button, input, a, div[role="button"], span'));
            const target = elements.find(el => 
                el.innerText?.toLowerCase().includes(label) || 
                el.placeholder?.toLowerCase().includes(label) ||
                el.ariaLabel?.toLowerCase().includes(label) ||
                el.className?.toLowerCase().includes(label)
            );
            
            if (target) {
                const rect = target.getBoundingClientRect();
                return {
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY,
                    width: rect.width,
                    height: rect.height
                };
            }
            return null;
        }, targetLabel.toLowerCase());
    }
};

// --- 🧠 BEHAVIORAL INTERACTION LAYER ---
const HumanAI = {
    hesitate: async (min = 400, max = 1200) => {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(r => setTimeout(r, delay));
    },

    smartVisionClick: async (page, cursor, label) => {
        const coords = await VisionAI.locateElement(page, label);
        if (coords) {
            const targetX = coords.x + (coords.width * (0.2 + Math.random() * 0.6));
            const targetY = coords.y + (coords.height * (0.2 + Math.random() * 0.6));

            await cursor.moveTo({ x: targetX, y: targetY });
            await HumanAI.hesitate(200, 600);
            
            await page.mouse.down();
            await page.mouse.move(targetX + (Math.random() * 2), targetY + (Math.random() * 2), { steps: 3 });
            await page.mouse.up();
            return true;
        }
        return false;
    },

    smartType: async (page, selector, text) => {
        await page.focus(selector);
        for (const char of text) {
            const delay = "aeiou".includes(char.toLowerCase()) ? 60 : 130;
            await page.keyboard.type(char, { delay: Math.random() * delay + 50 });
            if (Math.random() < 0.01) {
                await page.keyboard.type('q', { delay: 100 });
                await page.keyboard.press('Backspace');
            }
        }
    }
};

// --- ⚡ TRADING LOGIC INJECTION ---
async function injectTradingLogic() {
    if (!state.page) return;
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

// --- 🛰️ NAVIGATION WATCHER (Auto-Start Logic) ---
async function startWatchingNavigation() {
    if (!state.page) return;
    const checkInterval = setInterval(async () => {
        try {
            const url = state.page.url();
            if (url.includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **DASHBOARD DETECTED!** AI Vision is now mapping the UI...");
                await injectTradingLogic();
                state.isAuto = true; 
                sniperLoop(); 
                await log("🚀 **AUTO-PILOT ENGAGED.** Good luck!");
                clearInterval(checkInterval);
            }
        } catch (e) {}
    }, 2000);
}

// --- ⚙️ BROWSER ENGINE (Railway Stability) ---
async function bootEngine(queryId) {
    if (queryId) bot.answerCallbackQuery(queryId).catch(() => {});
    await log("🛡️ **Launching Eagle-Eye Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.setDefaultNavigationTimeout(90000);
        
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        await injectTradingLogic();
        startWatchingNavigation();

        await log("✅ **ENGINE ONLINE.**\n\n- `/confirm` (Smart Type)\n- `/i_am_not_a_robot` (Visual Map)\n- `/sign_in` (Eagle Eye)");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 🤖 AI VISION CAPTCHA ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (!state.page) return;
    await log("🕵️ **Vision Scanning for Captcha...**");
    try {
        const frames = state.page.frames();
        const captchaFrame = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box'));
        const checkbox = await captchaFrame.waitForSelector('.recaptcha-checkbox-border, #checkbox', { visible: true, timeout: 5000 });
        
        const frameEl = await captchaFrame.frameElement();
        const fBox = await frameEl.boundingBox();
        const cBox = await checkbox.boundingBox();

        const targetX = fBox.x + cBox.x + cBox.width/2;
        const targetY = fBox.y + cBox.y + cBox.height/2;

        await state.cursor.moveTo({ x: targetX, y: targetY });
        await state.page.mouse.down();
        await new Promise(r => setTimeout(r, 120));
        await state.page.mouse.up();
        await log("✅ **Captcha Toggled via Visual Mapping.**");
    } catch (e) { await log("❌ Vision failed to find Captcha."); }
});

// --- 🔑 LOGIN COMMANDS ---
bot.onText(/\/confirm/, async () => {
    if (!state.page) return;
    await log("⌨️ **Smart-Typing credentials...**");
    await HumanAI.smartType(state.page, 'input[name="email"]', state.tempEmail);
    await HumanAI.hesitate(400, 900);
    await HumanAI.smartType(state.page, 'input[name="password"]', state.tempPass);
    await log("🚀 Typed.");
});

bot.onText(/\/sign_in/, async () => {
    if (!state.page) return;
    await log("🖱️ **Eagle-Eye locating Sign-In...**");
    const success = await HumanAI.smartVisionClick(state.page, state.cursor, "sign in");
    if (success) {
        await log("🚀 **Login Clicked.** Waiting for redirect...");
    } else {
        await log("⚠️ Vision search failed, trying fallback click...");
        await state.page.click('button[type="submit"]').catch(()=>{});
    }
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
            const traded = await HumanAI.smartVisionClick(state.page, state.cursor, dir);
            if (traded) {
                state.lastTradeTime = Date.now();
                await log(`💰 **AI SNIPE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
            }
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM INTERFACE ---
bot.on('callback_query', async (q) => {
    if (q.data === "boot") { await bootEngine(q.id); return; }
    bot.answerCallbackQuery(q.id).catch(() => {});
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO AI SNIPER V17: EAGLE-EYE**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});

console.log("🚀 Eagle-Eye Server running. Redundancy fixed.");
