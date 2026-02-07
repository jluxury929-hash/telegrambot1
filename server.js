require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

puppeteer.use(StealthPlugin());

const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, 
    strategy: 'AI-EagleEye-V18-AntiDrag',
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

// --- 👁️ AI VISION LAYER (Anti-Highlight Edition) ---
const VisionAI = {
    locateElement: async (page, targetLabel) => {
        return await page.evaluate((label) => {
            const elements = Array.from(document.querySelectorAll('button, input, a, div[role="button"], span, .btn'));
            const target = elements.find(el => 
                el.innerText?.toLowerCase().includes(label) || 
                el.placeholder?.toLowerCase().includes(label) ||
                el.ariaLabel?.toLowerCase().includes(label) ||
                el.className?.toLowerCase().includes(label)
            );
            if (target) {
                const rect = target.getBoundingClientRect();
                return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
            }
            return null;
        }, targetLabel.toLowerCase());
    }
};

const HumanAI = {
    hesitate: async (min = 300, max = 800) => {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(r => setTimeout(r, delay));
    },

    // REFIXED: SmartClick to prevent dragging/highlighting
    smartVisionClick: async (page, cursor, label) => {
        const coords = await VisionAI.locateElement(page, label);
        if (coords) {
            // 1. Force Mouse Up to stop any ongoing "dragging"
            await page.mouse.up();
            
            const targetX = coords.x + (coords.width * (0.3 + Math.random() * 0.4));
            const targetY = coords.y + (coords.height * (0.3 + Math.random() * 0.4));

            // 2. Use ghost-cursor's internal click which manages the down/up state safely
            await cursor.click({ x: targetX, y: targetY }, { hesitate: 200 });
            return true;
        }
        return false;
    },

    smartType: async (page, selector, text) => {
        await page.focus(selector);
        // Clear existing text first to prevent double-typing errors
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        
        for (const char of text) {
            await page.keyboard.type(char, { delay: Math.random() * 70 + 50 });
        }
    }
};

// --- ⚙️ BROWSER ENGINE ---
async function bootEngine(queryId) {
    if (queryId) bot.answerCallbackQuery(queryId).catch(() => {});
    await log("🛡️ **Launching Anti-Drag AI Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: true,
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

// --- 🤖 COMMANDS ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1].trim(); log("📧 Email set."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1].trim(); log("🔑 Pass set."); });

bot.onText(/\/confirm/, async (msg) => {
    if (!state.page) return;
    await log("⌨️ **AI: Smart-Typing (No-Highlight Mode)...**");
    try {
        await HumanAI.smartType(state.page, 'input[name="email"]', state.tempEmail);
        await HumanAI.hesitate();
        await HumanAI.smartType(state.page, 'input[name="password"]', state.tempPass);
        await log("🚀 **Credentials entered.**");
    } catch (e) { await log("❌ Type failed."); }
});

bot.onText(/\/sign_in/, async (msg) => {
    if (!state.page) return;
    await log("🖱️ **AI: Precision Click (Fixing Dragging)...**");
    try {
        // Ensure no buttons are held down
        await state.page.mouse.up();
        
        const success = await HumanAI.smartVisionClick(state.page, state.cursor, "sign in");
        if (!success) {
            // Emergency fallback using raw selector if vision misses
            await state.page.click('button[type="submit"]');
        }
        await log("🚀 **Sign-in clicked.** Waiting for dashboard...");
    } catch (e) { await log("❌ Click failed."); }
});

bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (!state.page) return;
    await log("🕵️ **AI: Anti-Drag Captcha Click...**");
    try {
        const frames = state.page.frames();
        const captchaFrame = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box'));
        const checkbox = await captchaFrame.waitForSelector('.recaptcha-checkbox-border, #checkbox', { visible: true });
        
        const frameEl = await captchaFrame.frameElement();
        const fBox = await frameEl.boundingBox();
        const cBox = await checkbox.boundingBox();

        await state.page.mouse.up(); // Safety reset
        await state.cursor.click({ 
            x: fBox.x + cBox.x + cBox.width/2, 
            y: fBox.y + cBox.y + cBox.height/2 
        });
        await log("✅ **Captcha Toggled.**");
    } catch (e) { await log("❌ Captcha click failed."); }
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
                await log(`💰 **AI SNIPE:** ${dir} | RSI: ${rsi}`);
            }
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM UI ---
bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootEngine(q.id);
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO AI SNIPER V18**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});
