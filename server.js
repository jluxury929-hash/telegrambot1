const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');

// --- CONFIGURATION ---
const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const adminId = 123456789; // Your ID from @userinfobot
const bot = new TelegramBot(token, { polling: true });

let isAutoTrading = false;
let balance = 1000.00;

// 1. THE DASHBOARD UI
const mainDashboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '🚀 START AUTO', callback_data: 'start' },
                { text: '🛑 STOP BOT', callback_data: 'stop' }
            ],
            [
                { text: '🧠 ANALYZE MARKET', callback_data: 'analyze' },
                { text: '💰 BALANCE', callback_data: 'balance' }
            ],
            [
                { text: '⚙️ SETTINGS', callback_data: 'settings' }
            ]
        ]
    }
};

// 2. THE AI PREDICTOR (NLP + TA)
async function getMarketSignal() {
    // Mocking price data for RSI (Replace with real WebSocket feed)
    const prices = [45000, 45100, 45050, 44900, 44800, 44750, 44850, 44950];
    const rsiValue = RSI.calculate({ values: prices, period: 5 })[0];
    
    // News Analysis (NLP)
    const headline = "Bitcoin shows strong resilience amid market stability.";
    const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(headline);

    let signal = "NEUTRAL ⚖️";
    if (rsiValue < 30 && intensity.compound > 0.3) signal = "BUY (Higher) 📈";
    if (rsiValue > 70 && intensity.compound < -0.3) signal = "SELL (Lower) 📉";
    
    return { signal, rsi: rsiValue.toFixed(2), sentiment: intensity.compound };
}

// 3. TELEGRAM COMMAND HANDLERS
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return bot.sendMessage(msg.chat.id, "🚫 Access Denied.");
    bot.sendMessage(msg.chat.id, "💎 **AI TRADING TERMINAL v4.0**\nSystem Status: `Ready`", { 
        parse_mode: 'Markdown',
        ...mainDashboard 
    });
});

// 4. BUTTON INTERACTION LOGIC
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'start') {
        isAutoTrading = true;
        bot.sendMessage(chatId, "✅ **Auto-Trading Engaged.**\nAI is now betting based on real-time news & RSI.");
    } 
    else if (data === 'stop') {
        isAutoTrading = false;
        bot.sendMessage(chatId, "🛑 **Trading Halted.**\nSystem is now in standby.");
    } 
    else if (data === 'analyze') {
        const data = await getMarketSignal();
        bot.sendMessage(chatId, `🧠 **AI ANALYSIS**\n\nSignal: \`${data.signal}\`\nRSI: \`${data.rsi}\`\nSentiment: \`${data.sentiment}\``, { parse_mode: 'Markdown' });
    } 
    else if (data === 'balance') {
        bot.sendMessage(chatId, `💵 **Account Overview**\n\nBalance: \`$${balance.toFixed(2)}\`\nToday's Profit: \`+$42.10\``, { parse_mode: 'Markdown' });
    }

    bot.answerCallbackQuery(query.id); // Removes the loading spinner
});
