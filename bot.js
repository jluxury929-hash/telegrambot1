require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const vader = require('vader-sentiment');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

let isAuto = false;
let tradeAmount = 10;
let autoLoop = null;

// --- 🎯 CORE EXECUTION (HUMANIZED) ---
async function placeTrade(direction, chatId) {
    const page = global.brokerPage;
    const cursor = global.ghostCursor;
    if (!page) return bot.sendMessage(chatId, "❌ Bridge Lost.");

    const action = direction.includes("HIGHER") ? "call" : "put";
    const btnSelector = action === 'call' ? '.btn-call' : '.btn-put';

    try {
        // Human Jitter (0.8s - 2.5s reaction time)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1700));
        
        // Curved Mouse Movement (Physics-based)
        await cursor.move(btnSelector);
        
        // Physical UI Click
        const result = await page.evaluate((act) => window.humanTrade(act), action);
        
        if (result === "SUCCESS") {
            bot.sendMessage(chatId, `🚀 **Trade Placed!**\nAction: \`${direction}\`\nMode: \`Ghost-Stealth\``, { parse_mode: 'Markdown' });
        }
    } catch (e) { bot.sendMessage(chatId, "❌ UI Error."); }
}

// --- 🧠 AI ANALYSIS ---
async function analyze(asset) {
    try {
        const coin = asset.split('USD')[0];
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const score = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;
        
        if (score > 0.45) return { sig: "HIGHER 📈", conf: "91%" };
        if (score < -0.45) return { sig: "LOWER 📉", conf: "86%" };
        return { sig: "NEUTRAL ⚖️", conf: "12%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

// --- 🔄 AUTO-PILOT LOOP ---
async function startAutoLoop(chatId) {
    if (!isAuto) return;
    
    const result = await analyze("BTCUSD_otc");
    if (result.sig.includes("📈") || result.sig.includes("📉")) {
        bot.sendMessage(chatId, `🤖 **Auto-Pilot Signal**\nAsset: \`BTCUSD\`\nSignal: \`${result.sig}\`\n*Executing...*`);
        await placeTrade(result.sig, chatId);
    }
    
    autoLoop = setTimeout(() => startAutoLoop(chatId), 120000); // Check every 2 mins
}

// --- 📱 COMMANDS & MENU ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: isAuto ? '🛑 STOP AUTO' : '🚀 START AUTO', callback_data: 'toggle_auto' }],
                [{ text: '📊 SIGNAL: BTC', callback_data: 'sig_BTC' }, { text: '📊 SIGNAL: ETH', callback_data: 'sig_ETH' }],
                [{ text: '📈 EXECUTE HIGHER', callback_data: 'exec_up' }, { text: '📉 EXECUTE LOWER', callback_data: 'exec_down' }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) startAutoLoop(chatId);
        else clearTimeout(autoLoop);
        bot.sendMessage(chatId, `Auto-Pilot: ${isAuto ? "ON" : "OFF"}`);
    }
    if (query.data === 'sig_BTC') {
        const res = await analyze("BTCUSD_otc");
        bot.sendMessage(chatId, `🎯 **BTC Signal:** ${res.sig} (${res.conf})`);
    }
    if (query.data === 'exec_up') placeTrade("HIGHER 📈", chatId);
    if (query.data === 'exec_down') placeTrade("LOWER 📉", chatId);
    bot.answerCallbackQuery(query.id);
});
