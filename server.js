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
    isAuto: false,
    adminId: 6588957206, // Replace with your ID if different
    tradeAmount: 1,
    lastTradeTime: 0,
    isPredicting: false
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

async function log(m) { 
    await bot.sendMessage(state.adminId, m, { parse_mode: 'Markdown' }).catch(()=>{}); 
}

// --- ⚙️ BROWSER ENGINE ---
async function bootBrowser() {
    await log("⚙️ **Launching AI Engine...**");
    try {
        const browser = await puppeteer.launch({
            headless: false, // Keep false; xvfb-run handles the display
            executablePath: require('puppeteer').executablePath(), 
            args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
        });

        state.page = (await browser.pages())[0];
        state.cursor = createCursor(state.page);
        await state.page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
        
        await state.page.evaluate(() => {
            window.pocketHFT = (dir) => {
                const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                if (btn) {
                    ['mousedown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles: true})));
                    return "OK";
                }
            };
        });

        await log("✅ **ENGINE ONLINE.** Login manually. Type `/snap` to see the screen.");
    } catch (e) {
        await log(`❌ **LAUNCH ERROR:** ${e.message}`);
    }
}

// --- 📊 ANALYTICAL SCAN ---
async function analyze() {
    try {
        const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=30`);
        const closes = res.data.map(d => parseFloat(d[4]));
        const rsi = TA.rsi({ values: closes, period: 14 }).pop();
        return { signal: rsi < 31 ? "UP" : rsi > 69 ? "DOWN" : "WAIT", rsi: rsi.toFixed(1) };
    } catch (e) { return { signal: "WAIT" }; }
}

// --- 🤖 AUTO-SNIPER ---
async function sniperLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;
    const a = await analyze();
    if (a.signal !== "WAIT") {
        state.isPredicting = true;
        await log(`🔮 **PREDICTION:** ${a.signal} (RSI: ${a.rsi}) - Placing bet in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        try {
            await state.cursor.move(a.signal === "UP" ? ".btn-call" : ".btn-put");
            await state.page.evaluate((d) => window.pocketHFT(d.toLowerCase()), a.signal);
            await log(`✅ **BET PLACED.**`);
        } catch (e) { console.error(e); } finally { state.isPredicting = false; }
    }
    setTimeout(sniperLoop, 5000);
}

// --- 📱 TELEGRAM INTERFACE ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **PRO TERMINAL v7**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 BOOT ENGINE", callback_data: "boot" }],
                [{ text: state.isAuto ? "🛑 STOP" : "⚡ START AUTO", callback_data: "auto" }],
                [{ text: "📸 SCREENSHOT", callback_data: "snap" }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === "boot") await bootBrowser();
    if (q.data === "auto") {
        state.isAuto = !state.isAuto;
        if (state.isAuto) sniperLoop();
        await log(state.isAuto ? "⚡ **Auto-Pilot: ON**" : "🛑 **Auto-Pilot: OFF**");
    }
    if (q.data === "snap") {
        if (!state.page) return bot.sendMessage(state.adminId, "❌ Engine not booted.");
        const pic = await state.page.screenshot();
        bot.sendPhoto(state.adminId, pic, { caption: "📸 Live View" });
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 AI SNIPER READY.");
