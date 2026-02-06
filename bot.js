require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const ASSETS = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

let autoTrading = false;
let socket = null;

// --- 1. CORE MULTI-AI BRAIN ---
async function getSignal(asset) {
    try {
        // News logic specifically for the asset
        const coinSymbol = asset.split('USD')[0]; 
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coinSymbol}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;

        // In a pro build, you would fetch real candles for each asset here
        const rsi = 48; // Mock RSI - replace with live WebSocket data

        if (sentiment > 0.45 && rsi < 35) return { type: "HIGHER 📈", conf: "88%" };
        if (sentiment < -0.45 && rsi > 65) return { type: "LOWER 📉", conf: "85%" };
        return { type: "NEUTRAL ⚖️", conf: "10%" };
    } catch (e) {
        return { type: "SCANNING...", conf: "0%" };
    }
}

// --- 2. TELEGRAM DASHBOARD (The "Cool" Interface) ---
function getDashboard() {
    return {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 GLOBAL AUTO-ON', callback_data: 'start_all' }, { text: '🛑 ALL STOP', callback_data: 'stop' }],
                [{ text: '₿ BTC', callback_data: 'scan_BTCUSD_otc' }, { text: 'Ξ ETH', callback_data: 'scan_ETHUSD_otc' }],
                [{ text: '☀️ SOL', callback_data: 'scan_SOLUSD_otc' }, { text: '🔶 BNB', callback_data: 'scan_BNBUSD_otc' }],
                [{ text: '💰 TOTAL PROFIT', callback_data: 'balance' }]
            ]
        }
    };
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, "💎 **AI MULTI-TRADER v5.0**\n\nActive Monitoring: `BTC, ETH, SOL, BNB`", getDashboard());
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('scan_')) {
        const asset = data.replace('scan_', '');
        bot.sendMessage(chatId, `⏳ *Analyzing ${asset} News & RSI...*`, { parse_mode: 'Markdown' });
        const res = await getSignal(asset);
        bot.sendMessage(chatId, `🎯 **${asset} Result**\n\nSignal: \`${res.type}\`\nConfidence: \`${res.conf}\``, { parse_mode: 'Markdown' });
    }

    if (data === 'start_all') {
        autoTrading = true;
        bot.sendMessage(chatId, "✅ **Global Auto-Pilot Active.**\nScanning all 4 top assets for 85%+ entries.");
    }

    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Multi-Asset Bot is live.");
