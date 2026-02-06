require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- AI PREDICTOR ENGINE ---
async function getAnalysis() {
    // 1. Fetch Real-time News (NLP)
    // Using a free aggregator - change to a pro API for better accuracy
    const newsRes = await axios.get('https://free-crypto-news.vercel.app/api/news?limit=3');
    const headlines = newsRes.data.map(a => a.title).join(". ");
    const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;

    // 2. Technical Analysis (Simulated RSI)
    // In a live bot, you'd feed this actual price candles from a WebSocket
    const mockPrices = [45000, 45100, 45200, 45150, 45300, 45400, 45250];
    const rsi = RSI.calculate({ values: mockPrices, period: 5 }).pop();

    let suggestion = "NEUTRAL ⚖️";
    if (rsi < 40 && sentiment > 0.2) suggestion = "HIGHER (Call) 📈";
    if (rsi > 60 && sentiment < -0.2) suggestion = "LOWER (Put) 📉";

    return { suggestion, rsi: rsi.toFixed(2), sentiment: sentiment.toFixed(2) };
}

// --- TELEGRAM UI DASHBOARD ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== parseInt(process.env.ADMIN_ID)) return;

    bot.sendMessage(msg.chat.id, "💎 **AI TRADING DASHBOARD**\n\nMode: `Standby`\nMarket: `BTC/USD`", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 START AUTO', callback_data: 'start' }, { text: '🛑 STOP', callback_data: 'stop' }],
                [{ text: '🧠 ANALYZE NOW', callback_data: 'analyze' }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'analyze') {
        const data = await getAnalysis();
        const report = `🧠 **AI MARKET REPORT**\n\nSignal: \`${data.suggestion}\`\nRSI: \`${data.rsi}\`\nSentiment: \`${data.sentiment}\``;
        bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    }
    
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Bot is online and waiting for /start on Telegram");
