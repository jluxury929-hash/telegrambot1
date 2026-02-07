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
    loggedIn: false,
    lastTradeTime: 0,
    tempEmail: process.env.EMAIL || '',
    tempPass: process.env.PASS || ''
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 BEHAVIORAL AI INTERACTION LAYER ---
const HumanAI = {
    // Mimic human "thinking time"
    hesitate: async (min = 400, max = 1200) => {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(r => setTimeout(r, delay));
    },

    // Move mouse and click with human-like entropy
    smartClick: async (page, cursor, selector) => {
        try {
            const element = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
            const rect = await element.boundingBox();

            // Randomize target point within the button (avoiding dead-center)
            const x = rect.x + (rect.width * (0.2 + Math.random() * 0.6));
            const y = rect.y + (rect.height * (0.2 + Math.random() * 0.6));

            await cursor.moveTo({ x, y });
            await HumanAI.hesitate(200, 600); // Hover pause

            // Shaky click (MouseDown -> Micro-drag -> MouseUp)
            await page.mouse.down();
            await page.mouse.move(x + (Math.random() * 2), y + (Math.random() * 2), { steps: 3 });
            await page.mouse.up();
            return true;
        } catch (e) { return false; }
    },

    // Burst typing like a real user
    smartType: async (page, selector, text) => {
        await page.focus(selector);
        for (const char of text) {
            // Variable delay: fast on vowels, slow on reach-keys
            const delay = "aeiou".includes(char.toLowerCase()) ? 50 : 120;
            await page.keyboard.type(char, { delay: Math.random() * delay + 40 });
            
            // 1% chance of a typo and immediate correction
            if (Math.random() < 0.01) {
                await page.keyboard.type('q', { delay: 100 });
                await page.keyboard.press('Backspace');
            }
        }
    }
};

// --- ⚙️ BROWSER ENGINE (Railway Optimized) ---
async function bootEngine(qId) {
    if (qId) bot.answerCallbackQuery(qId).catch(() => {});
    await log("🛡️ **Launching Human-Behavioral AI Engine...**");
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.setViewport({ width: 1280, height: 800 });
        
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        // Navigation Watcher (Dashboard Sentinel)
        const watcher = setInterval(async () => {
            if (state.page.url().includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **AI CONFIRMED DASHBOARD.** Sniper starting...");
                state.isAuto = true;
                sniperLoop();
                clearInterval(watcher);
            }
        }, 2500);

        await log("✅ **ENGINE ONLINE.**\n\n- `/confirm` (Smart Type)\n- `/i_am_not_a_robot` (Human Glide)\n- `/sign_in` (Smart Click)");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 🤖 AI-HEALING CAPTCHA (Deep-Frame Logic) ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (!state.page) return;
    try {
        const frames = state.page.frames();
        const captchaFrame = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box'));
        const selector = '.recaptcha-checkbox-border, #checkbox, [role="checkbox"]';
        const checkbox = await captchaFrame.waitForSelector(selector, { visible: true, timeout: 5000 });
        
        const frameEl = await captchaFrame.frameElement();
        const fBox = await frameEl.boundingBox();
        const cBox = await checkbox.boundingBox();

        const targetX = fBox.x + cBox.x + cBox.width/2 + (Math.random() * 4 - 2);
        const targetY = fBox.y + cBox.y + cBox.height/2 + (Math.random() * 4 - 2);

        await log("🖱️ **AI: Gliding mouse to Captcha frame...**");
        await state.cursor.moveTo({ x: targetX, y: targetY });
        await HumanAI.hesitate(300, 700);
        
        await state.page.mouse.down();
        await new Promise(r => setTimeout(r, 120));
        await state.page.mouse.up();
        await log("✅ **Captcha Toggled.**");
    } catch (e) { await log("❌ AI Captcha click failed."); }
});

// --- 🔑 COMMANDS ---
bot.onText(/\/confirm/, async () => {
    if (!state.page) return;
    await log("⌨️ **AI: Typing credentials with natural cadence...**");
    await HumanAI.smartType(state.page, 'input[name="email"]', state.tempEmail);
    await HumanAI.hesitate(300, 800);
    await HumanAI.smartType(state.page, 'input[name="password"]', state.tempPass);
    await log("🚀 Typed.");
});

bot.onText(/\/sign_in/, async () => {
    if (!state.page) return;
    await log("🖱️ **AI: Executing Smart Sign-In...**");
    try {
        await Promise.all([
            state.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }),
            HumanAI.smartClick(state.page, state.cursor, 'button[type="submit"]')
        ]);
    } catch (e) { await log("⚠️ Waiting for redirect..."); }
});

// --- 📈 SNIPER LOOP ---
async function sniperLoop() {
    if (!state.isAuto || !state.page) return;
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        
        if ((rsi < 31 || rsi > 69) && (Date.now() - state.lastTradeTime > 60000)) {
            const dir = rsi < 31 ? "UP" : "DOWN";
            
            // AI click on trade buttons
            const selector = dir === "UP" ? ".btn-call" : ".btn-put";
            await HumanAI.smartClick(state.page, state.cursor, selector);
            
            state.lastTradeTime = Date.now();
            await log(`💰 **AI TRADE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM UI ---
bot.on('callback_query', async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});
    if (q.data === "boot") await bootEngine(q.id);
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **AI SNIPER V16: HUMAN BEHAVIORAL**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});

console.log("🚀 Behavioral AI Server Running.");require('dotenv').config();
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
    loggedIn: false,
    lastTradeTime: 0,
    tempEmail: process.env.EMAIL || '',
    tempPass: process.env.PASS || ''
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- 🧠 BEHAVIORAL AI INTERACTION LAYER ---
const HumanAI = {
    // Mimic human "thinking time"
    hesitate: async (min = 400, max = 1200) => {
        const delay = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(r => setTimeout(r, delay));
    },

    // Move mouse and click with human-like entropy
    smartClick: async (page, cursor, selector) => {
        try {
            const element = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
            const rect = await element.boundingBox();

            // Randomize target point within the button (avoiding dead-center)
            const x = rect.x + (rect.width * (0.2 + Math.random() * 0.6));
            const y = rect.y + (rect.height * (0.2 + Math.random() * 0.6));

            await cursor.moveTo({ x, y });
            await HumanAI.hesitate(200, 600); // Hover pause

            // Shaky click (MouseDown -> Micro-drag -> MouseUp)
            await page.mouse.down();
            await page.mouse.move(x + (Math.random() * 2), y + (Math.random() * 2), { steps: 3 });
            await page.mouse.up();
            return true;
        } catch (e) { return false; }
    },

    // Burst typing like a real user
    smartType: async (page, selector, text) => {
        await page.focus(selector);
        for (const char of text) {
            // Variable delay: fast on vowels, slow on reach-keys
            const delay = "aeiou".includes(char.toLowerCase()) ? 50 : 120;
            await page.keyboard.type(char, { delay: Math.random() * delay + 40 });
            
            // 1% chance of a typo and immediate correction
            if (Math.random() < 0.01) {
                await page.keyboard.type('q', { delay: 100 });
                await page.keyboard.press('Backspace');
            }
        }
    }
};

// --- ⚙️ BROWSER ENGINE (Railway Optimized) ---
async function bootEngine(qId) {
    if (qId) bot.answerCallbackQuery(qId).catch(() => {});
    await log("🛡️ **Launching Human-Behavioral AI Engine...**");
    
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.setViewport({ width: 1280, height: 800 });
        
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        // Navigation Watcher (Dashboard Sentinel)
        const watcher = setInterval(async () => {
            if (state.page.url().includes('cabinet') && !state.loggedIn) {
                state.loggedIn = true;
                await log("🎊 **AI CONFIRMED DASHBOARD.** Sniper starting...");
                state.isAuto = true;
                sniperLoop();
                clearInterval(watcher);
            }
        }, 2500);

        await log("✅ **ENGINE ONLINE.**\n\n- `/confirm` (Smart Type)\n- `/i_am_not_a_robot` (Human Glide)\n- `/sign_in` (Smart Click)");
    } catch (e) { await log(`❌ **LAUNCH ERROR:** ${e.message}`); }
}

// --- 🤖 AI-HEALING CAPTCHA (Deep-Frame Logic) ---
bot.onText(/\/i_am_not_a_robot/, async (msg) => {
    if (!state.page) return;
    try {
        const frames = state.page.frames();
        const captchaFrame = frames.find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha.com/box'));
        const selector = '.recaptcha-checkbox-border, #checkbox, [role="checkbox"]';
        const checkbox = await captchaFrame.waitForSelector(selector, { visible: true, timeout: 5000 });
        
        const frameEl = await captchaFrame.frameElement();
        const fBox = await frameEl.boundingBox();
        const cBox = await checkbox.boundingBox();

        const targetX = fBox.x + cBox.x + cBox.width/2 + (Math.random() * 4 - 2);
        const targetY = fBox.y + cBox.y + cBox.height/2 + (Math.random() * 4 - 2);

        await log("🖱️ **AI: Gliding mouse to Captcha frame...**");
        await state.cursor.moveTo({ x: targetX, y: targetY });
        await HumanAI.hesitate(300, 700);
        
        await state.page.mouse.down();
        await new Promise(r => setTimeout(r, 120));
        await state.page.mouse.up();
        await log("✅ **Captcha Toggled.**");
    } catch (e) { await log("❌ AI Captcha click failed."); }
});

// --- 🔑 COMMANDS ---
bot.onText(/\/confirm/, async () => {
    if (!state.page) return;
    await log("⌨️ **AI: Typing credentials with natural cadence...**");
    await HumanAI.smartType(state.page, 'input[name="email"]', state.tempEmail);
    await HumanAI.hesitate(300, 800);
    await HumanAI.smartType(state.page, 'input[name="password"]', state.tempPass);
    await log("🚀 Typed.");
});

bot.onText(/\/sign_in/, async () => {
    if (!state.page) return;
    await log("🖱️ **AI: Executing Smart Sign-In...**");
    try {
        await Promise.all([
            state.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 }),
            HumanAI.smartClick(state.page, state.cursor, 'button[type="submit"]')
        ]);
    } catch (e) { await log("⚠️ Waiting for redirect..."); }
});

// --- 📈 SNIPER LOOP ---
async function sniperLoop() {
    if (!state.isAuto || !state.page) return;
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        
        if ((rsi < 31 || rsi > 69) && (Date.now() - state.lastTradeTime > 60000)) {
            const dir = rsi < 31 ? "UP" : "DOWN";
            
            // AI click on trade buttons
            const selector = dir === "UP" ? ".btn-call" : ".btn-put";
            await HumanAI.smartClick(state.page, state.cursor, selector);
            
            state.lastTradeTime = Date.now();
            await log(`💰 **AI TRADE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
        }
    } catch (e) {}
    setTimeout(sniperLoop, 4000); 
}

// --- 📱 TELEGRAM UI ---
bot.on('callback_query', async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});
    if (q.data === "boot") await bootEngine(q.id);
    if (q.data === "snap") {
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **AI SNIPER V16: HUMAN BEHAVIORAL**", {
        reply_markup: { inline_keyboard: [[{ text: "🌐 BOOT ENGINE", callback_data: "boot" }], [{ text: "📸 SNAP", callback_data: "snap" }]] }
    });
});

console.log("🚀 Behavioral AI Server Running.");
