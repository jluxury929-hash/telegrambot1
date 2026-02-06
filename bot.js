require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const vader = require('vader-sentiment');
const bridge = require('./browserManager');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206; 

let isAuto = false;
let autoLoop = null;

// --- 🛰️ LIVE TELEGRAM LOGGER ---
async function log(message) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${message}`);
    try {
        await bot.sendMessage(adminId, `🔔 **LOG:** \`[${time}]\`\n> ${message}`, { parse_mode: 'Markdown' });
    } catch (e) { console.error("Log Error:", e.message); }
}

// --- 🎯 HUMANIZED EXECUTION ---
async function placeTrade(direction, chatId) {
    try {
        const { page, cursor } = bridge.getBridge();
        const action = direction.includes("HIGHER") ? "call" : "put";
        const btnSelector = action === 'call' ? '.btn-call' : '.btn-put';

        await log(`Signal: **${direction}**. Initializing human movement...`);

        // 1. Random Reaction Jitter
        const jitter = 800 + Math.random() * 1500;
        await new Promise(r => setTimeout(r, jitter));
        
        // 2. Ghost-Cursor Physics
        await log(`Moving mouse to **${action.toUpperCase()}** button...`);
        await cursor.move(btnSelector);
        
        // 3. UI Interaction
        const result = await page.evaluate((act) => window.humanTrade(act), action);
        
        if (result === "SUCCESS") {
            await log(`✅ **BET PLACED.** Order is now live on Pocket Option.`);
        } else {
            await log(`⚠️ **UI ERROR:** Asset chart might be hidden.`);
        }
    } catch (e) { await log(`❌ **BRIDGE ERROR:** ${e.message}`); }
}

// --- 🧠 AI SCANNER ---
async function analyze(asset) {
    try {
        const res = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=BTC&lang=EN`);
        const text = res.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const score = vader.SentimentIntensityAnalyzer.polarity_scores(text).compound;
        
        if (score > 0.4) return { sig: "HIGHER 📈", conf: "92%", score };
        if (score < -0.4) return { sig: "LOWER 📉", conf: "87%", score };
        return { sig: "NEUTRAL ⚖️", conf: "5%", score };
    } catch (e) { return { sig: "NEUTRAL ⚖️", conf: "0%", score: 0 }; }
}

// --- 🔄 AUTO-PILOT ---
async function runAuto(chatId) {
    if (!isAuto) return;
    await log("🧐 AI is scanning market sentiment...");
    const res = await analyze("BTCUSD_otc");

    if (res.sig !== "NEUTRAL ⚖️") {
        await log(`🎯 **MATCH!** ${res.sig} (Conf: ${res.conf})`);
        await placeTrade(res.sig, chatId);
    } else {
        await log(`😴 No setup found. Score: ${res.score.toFixed(2)}. Sleeping 3m...`);
    }
    autoLoop = setTimeout(() => runAuto(chatId), 180000);
}

// --- 📱 MENU ---
const getMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: isAuto ? '🛑 STOP AUTO' : '🚀 START AUTO', callback_data: 'toggle_auto' }],
            [{ text: '📊 SIGNAL: BTC', callback_data: 'sig_BTC' }],
            [{ text: '📈 EXECUTE UP', callback_data: 'exec_up' }, { text: '📉 EXECUTE DOWN', callback_data: 'exec_down' }]
        ]
    }
});

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V4.2**", getMenu());
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) runAuto(chatId); else clearTimeout(autoLoop);
        bot.editMessageText(`💎 **TERMINAL**\nAuto: \`${isAuto ? 'ON' : 'OFF'}\``, {
            chat_id: chatId, message_id: query.message.message_id, ...getMenu()
        });
    }
    if (query.data === 'sig_BTC') {
        const res = await analyze();
        bot.sendMessage(chatId, `🎯 **BTC:** ${res.sig} (${res.conf})`);
    }
    if (query.data === 'exec_up') placeTrade("HIGHER 📈", chatId);
    if (query.data === 'exec_down') placeTrade("LOWER 📉", chatId);
    bot.answerCallbackQuery(query.id);
});
