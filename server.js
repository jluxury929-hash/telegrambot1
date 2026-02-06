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
    strategy: 'HFT-Sniper-V8',
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

        await log("✅ **ENGINE ONLINE.**\n\n1. Use `/email` & `/password`\n2. Type `/confirm` to type them.\n3. Type `/i_am_not_a_robot` if captcha appears.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 🤖 THE "I AM NOT A ROBOT" PRECISION CLICKER ---
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

            await log("🖱️ **Moving mouse in human-path...**");
            await state.cursor.moveTo({ x: targetX, y: targetY });
            
            await state.page.mouse.down();
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
            await state.page.mouse.up();
            await log("✅ **Checkbox clicked.**");
        }
    } catch (e) { await log(`❌ **Precision Click Failed:** ${e.message}`); }
});

// --- 🔑 CREDENTIALS & CONFIRM ---
bot.onText(/\/email (.+)/, (msg, m) => { state.tempEmail = m[1]; log("📧 Email set."); });
bot.onText(/\/password (.+)/, (msg, m) => { state.tempPass = m[1]; log("🔑 Password set."); });

bot.onText(/\/confirm/, async (msg) => {
    if (msg.from.id !== state.adminId || !state.page) return;
    if (!state.tempEmail || !state.tempPass) return log("❌ Set credentials first.");
    
    await log("⌨️ **Typing credentials with human delays...**");
    try {
        await state.page.type('input[name="email"]', state.tempEmail, { delay: 150 });
        await state.page.type('input[name="password"]', state.tempPass, { delay: 180 });
        await log("🚀 **Typed.** Check for captcha, then hit Login Submit.");
    } catch (e) { await log("❌ Fields not found."); }
});

// --- 📈 ANALYTICAL ENGINE ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=40`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        const bb = TA.bollingerbands({ values: closes, period: 20, stdDev: 2 }).pop();
        const price = closes[closes.length - 1];

        let signal = "NEUTRAL", chance = 50;
        if (rsi < 31 && price <= bb.lower) { signal = "UP"; chance = 94; }
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
    if (msg.from.id !== state.adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **PRO SNIPER v8.8**\n\n- Captcha-Killer: `/i_am_not_a_robot` \n- Login: `/confirm`", mainMenu);
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
        if (!state.page) return bot.answerCallbackQuery(q.id, { text: "Engine not booted!" });
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic);
    }
    if (data === "scan") {
        const a = await analyze();
        await log(`📡 **SCAN:** ${a.signal} | Prob: ${a.chance}% | RSI: ${a.rsi}`);
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Server running. Sniper & Captcha-Killer active.");
