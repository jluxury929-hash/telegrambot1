require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const TA = require('technicalindicators');

puppeteer.use(StealthPlugin());

// --- SYSTEM STATE ---
const state = {
    page: null,
    cursor: null,
    isAuto: false,
    adminId: 6588957206, 
    strategy: 'HFT-Sniper',
    isPredicting: false,
    lastTradeTime: 0,
    tempEmail: '',
    tempPass: ''
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) {
    console.log(`[LOG]: ${m}`);
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{});
}

// --- BROWSER ENGINE ---
async function bootEngine() {
    await log("🛡️ **Initializing Stealth Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--remote-debugging-port=9222',
                '--remote-debugging-address=0.0.0.0',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--lang=en-US,en;q=0.9' // Set language to appear more human
            ]
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        
        // Hide Puppeteer fingerprints
        await state.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        await state.page.setViewport({ width: 1280, height: 800 });
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
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

        await log("✅ **ENGINE ONLINE.**\n\n1. `/email` & `/password` \n2. `/confirm` to execute bypass & login.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 📈 PREDICTIVE ANALYSIS ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", chance = 50;
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; chance = 93; }
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
        await log(`🔮 **PREDICTION:** ${intel.signal} (${intel.chance}%)`);
        try {
            await state.cursor.move(intel.signal === "UP" ? ".btn-call" : ".btn-put");
            const res = await state.page.evaluate((d) => window.pocketExecute(d.toLowerCase()), intel.signal);
            if (res === "OK") {
                state.lastTradeTime = Date.now();
                await log(`✅ **TRADE PLACED.**`);
            }
        } catch (e) {
            await log(`❌ Execution error: ${e.message}`);
        } finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 4000);
}

// --- 🔑 CREDENTIAL & CAPTCHA BYPASS COMMANDS ---
bot.onText(/\/email (.+)/, async (msg, match) => {
    if (msg.from.id !== state.adminId) return;
    state.tempEmail = match[1];
    await log(`📧 Email set.`);
});

bot.onText(/\/password (.+)/, async (msg, match) => {
    if (msg.from.id !== state.adminId) return;
    state.tempPass = match[1];
    await log(`🔑 Password set.`);
});

bot.onText(/\/confirm/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    if (!state.tempEmail || !state.tempPass) return await log("❌ Please set email and password.");
    
    await log("⌨️ **Initiating Human-Mimicry Login...**");
    try {
        // 1. Enter Credentials with Human Delays
        await state.page.type('input[name="email"]', state.tempEmail, { delay: 150 });
        await new Promise(r => setTimeout(r, 800));
        await state.page.type('input[name="password"]', state.tempPass, { delay: 180 });

        // 2. DETECT & CLICK "I AM NOT A ROBOT"
        const captchaFrame = state.page.frames().find(f => f.url().includes('api2/anchor') || f.url().includes('hcaptcha'));
        if (captchaFrame) {
            await log("🤖 **Captcha detected. Attempting to solve checkbox...**");
            const checkbox = await captchaFrame.$('.recaptcha-checkbox-border, #checkbox');
            if (checkbox) {
                const box = await checkbox.boundingBox();
                // Move mouse in a curved path to the checkbox
                await state.cursor.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
                await checkbox.click();
                await log("✅ **Captcha Checkbox Clicked.**");
                await new Promise(r => setTimeout(r, 2000)); // Wait for verification
            }
        }

        // 3. Final Submit
        await state.page.click('button[type="submit"]');
        await log("🚀 **Login Submitted.** Check status with `/snap`.");
    } catch (e) { await log(`❌ Login Error: ${e.message}`); }
});

// --- 🔗 REMOTE LOGIN COMMANDS ---
bot.onText(/\/login/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    try {
        const response = await axios.get('http://127.0.0.1:9222/json/list');
        const pageData = response.data.find(p => p.url.includes('pocketoption.com'));
        const inspectorUrl = `https://chrome-devtools-frontend.appspot.com/serve_file/@ec8231d68303f27357417534c015b6d764789526/inspector.html?wss=127.0.0.1:9222/devtools/page/${pageData.id}`;
        await log(`🔗 **ACCESS LINK:**\n[Click here](${inspectorUrl})`);
    } catch (e) { await log("❌ Link failed."); }
});

bot.onText(/\/verify/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    if (state.page.url().includes('cabinet')) {
        await log("🎊 **LOGIN SUCCESSFUL.**");
        await state.page.evaluate(() => {
            window.pocketExecute = (dir) => {
                const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                if (btn) {
                    ['mousedown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles: true})));
                    return "OK";
                }
            };
        });
    } else { await log("⚠️ Not logged in yet."); }
});

// --- 📱 TELEGRAM INTERFACE ---
const mainMenu = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
            [{ text: state.isAuto ? "🛑 STOP AUTO" : "⚡ START SNIPER", callback_data: "auto" }],
            [{ text: "📸 SNAPSHOT", callback_data: "snap" }, { text: "📊 SCAN", callback_data: "scan" }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v8.7**\n- Captcha Bypass Ready\n- Human Mimicry Active", mainMenu);
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
        await log(`📡 **SCAN:** ${a.signal} (${a.chance}%)`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server is running. Captcha Bypass Active.");
