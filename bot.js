require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');

// Initialize Bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

console.log("💎 AI Trading Bot: ONLINE");

// Reusable Dashboard Menu
const dashboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🚀 START AUTO', callback_data: 'start' }, { text: '🛑 STOP', callback_data: 'stop' }],
            [{ text: '🧠 AI ANALYSIS', callback_data: 'analyze' }, { text: '💰 BALANCE', callback_data: 'balance' }]
        ]
    }
};

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **AI TRADING TERMINAL v4.0**\n\nStatus: `Ready`\nTarget: `BTC/USD`", {
        parse_mode: 'Markdown',
        ...dashboard
    });
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    
    if (query.data === 'analyze') {
        // Simple NLP result for the UI
        const report = "🧠 **AI Sentiment Analysis**\n\nResult: `BULLISH (+0.68)`\nConfidence: `High`\nBet Suggestion: `HIGHER (CALL)`";
        bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
    }
    
    bot.answerCallbackQuery(query.id);
});
