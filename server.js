require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const { typeInto } = require('@forad/puppeteer-humanize'); // Essential for 2026 stealth
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
    lastTradeTime: 0,
    loggedIn: false
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🧬 HUMAN BIOMETRIC ENGINE ---
const BiometricAI = {
    // 1. Human Mouse Physics (Ghost Cursor)
    // Moves in smooth, unpredictable curves with overshoot
    glide: async (cursor, selector) => {
        await cursor.click(selector, {
            moveSpeed: 500 + Math.random() * 500, // Varied speed
            hesitate: 200 + Math.random() * 600,  // Pause before clicking
            waitForClick: 80 + Math.random() * 100 // Time button is held down
        });
    },

    // 2. Human Keystroke Dynamics
    // Adds typos, variable speed, and backspacing
    type: async (page, selector, text) => {
        const element = await page.waitForSelector(selector);
        const config = {
            mistakes: { chance: 8, delay: { min: 100, max: 500 } }, // 8% chance of typo
            delays: { char: { min: 50, max: 150 } } // Varied speed per key
        };
        await typeInto(element, text, config);
    },

    // 3. Cognitive Hesitation
    // Mimics a human "thinking" before making a trade
    think: async () => {
        const pauses = [1000, 2500, 4000, 7000];
        const delay = pauses[Math.floor(Math.random() * pauses.length)] + Math.random() * 1000;
        return new Promise(r => setTimeout(r, delay));
    }
};

// --- ⚙️ BROWSER ENGINE (Persistent Session) ---
async function bootEngine() {
    await bot.sendMessage(state.adminId, "🦾 **Initializing Biometric Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: true, // Headless is fine if biometrics are humanized
            userDataDir: path.join(__dirname, 'session_data'), 
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page); // Attach Ghost Cursor
        
        await state.page.setViewport({ width: 1920, height: 1080 });
        await state.page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'networkidle2' });

        if (state.page.url().includes('cabinet')) {
            await bot.sendMessage(state.adminId, "✅ **Human Session Active.** Monitoring signals...");
            state.loggedIn = true;
            state.isAuto = true;
            sniperLoop();
        } else {
            await bot.sendMessage(state.adminId, "🔑 **Login required once.** Use `/login`.");
            await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        }
    } catch (e) { setTimeout(bootEngine, 10000); }
}

// --- 🖱️ HUMANIZED COMMANDS ---
bot.onText(/\/login/, async () => {
    if (!state.page) return;
    try {
        // Type Email like a human
        await BiometricAI.type(state.page, 'input[name="email"]', process.env.EMAIL);
        await BiometricAI.think();
        // Type Password like a human
        await BiometricAI.type(state.page, 'input[name="password"]', process.env.PASS);
        await bot.sendMessage(state.adminId, "🚀 **Typed.** Solve Captcha if needed, then `/sign_in`.");
    } catch (e) { await bot.sendMessage(state.adminId, "❌ Elements not found."); }
});

bot.onText(/\/sign_in/, async () => {
    // Glide mouse to the Sign-In button and click humanly
    await BiometricAI.glide(state.cursor, 'button[type="submit"]');
});

// --- 📈 SNIPER LOOP (Human Behavioral Logic) ---
async function sniperLoop() {
    if (!state.isAuto || !state.page) return;
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();

        if ((rsi < 31 || rsi > 69) && (Date.now() - state.lastTradeTime > 75000)) {
            const dir = rsi < 31 ? "Higher" : "Lower";
            
            // 1. Human "Reaction Time" (0.8s - 2.5s)
            await new Promise(r => setTimeout(r, 800 + Math.random() * 1700));

            // 2. Identify and Glide to Trade Button
            const selector = dir === "Higher" ? ".btn-call" : ".btn-put";
            await BiometricAI.glide(state.cursor, selector);

            state.lastTradeTime = Date.now();
            await bot.sendMessage(state.adminId, `💰 **AI TRADE:** ${dir} | RSI: ${rsi.toFixed(1)}`);
        }
    } catch (e) {}
    
    // 3. Variable Heartbeat (3s - 9s)
    const jitter = 3000 + (Math.random() * 6000);
    setTimeout(sniperLoop, jitter); 
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bootEngine();
});
