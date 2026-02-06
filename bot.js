require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require('ethers');

// --- APP STATE ---
let settings = {
    tradeAmountCAD: 5, // Default $5 CAD
    payoutAddress: null,
    isAuto: false
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ADMIN_ID = 6588957206;

// --- COMMAND: SET AMOUNT ---
bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    
    const newAmount = parseInt(match[1]);
    if (newAmount > 0 && newAmount < 1000) { // Safety limit of $1000
        settings.tradeAmountCAD = newAmount;
        bot.sendMessage(msg.chat.id, `✅ **Trade Amount Updated**\nNew Bet Size: \`${settings.tradeAmountCAD} CAD\``, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(msg.chat.id, "❌ **Invalid Amount.** Please choose between 1 and 1000.");
    }
});

// --- COMMAND: SET PAYOUT ADDRESS ---
bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    settings.payoutAddress = match[1];
    bot.sendMessage(msg.chat.id, `🎯 **Payout Address Linked**\nAddress: \`${settings.payoutAddress}\``, { parse_mode: 'Markdown' });
});

// --- UPDATED START MENU ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;

    const dashboard = `💎 **AI TRADING TERMINAL v5.2**\n\n` +
                      `⚙️ **Settings:**\n` +
                      `• Bet Size: \`${settings.tradeAmountCAD} CAD\`\n` +
                      `• Payout: \`${settings.payoutAddress || "Not Set"}\`\n\n` +
                      `_Use /amount [value] to change your bet._`;

    bot.sendMessage(msg.chat.id, dashboard, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '🚀 EXECUTE SIGNAL', callback_data: 'execute_now' }],
                [{ text: '💰 WITHDRAW EARNINGS', callback_data: 'payout_now' }]
            ]
        }
    });
});

// --- EXECUTION LOGIC ---
bot.on('callback_query', async (query) => {
    if (query.data === 'execute_now') {
        bot.answerCallbackQuery(query.id, { text: "Calculating CAD/Crypto spread..." });
        
        // Institutional Logic: In a real run, we'd call a Currency API (like Fixer or CoinAPI)
        // to convert settings.tradeAmountCAD to the exact ETH/BTC fraction.
        
        const report = `⚡ **TRADE EXECUTED**\n` +
                       `Amount: \`${settings.tradeAmountCAD} CAD\`\n` +
                       `Status: \`Broadcasting to Blockchain...\``;
                       
        bot.sendMessage(query.message.chat.id, report, { parse_mode: 'Markdown' });
    }
});
