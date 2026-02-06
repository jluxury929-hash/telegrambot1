require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');

// --- 1. CONFIG & WALLET SETUP ---
const adminId = 6588957206; 
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Setup Blockchain Connection (Using a Public RPC - replace with your own for speed)
const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- 2. GLOBAL APP STATE ---
let settings = {
    isAuto: false,
    tradeAmountCAD: 5, // $5 CAD default
    payoutAddress: null,
    ethPriceCAD: 3500  // Initial placeholder, updated live
};

// --- 3. DYNAMIC APP MENU ---
const getDashboard = () => ({
    parse_mode: 'Markdown',
    reply_markup: {
        inline_keyboard: [
            [{ text: settings.isAuto ? '🛑 STOP GLOBAL AUTO' : '🚀 START GLOBAL AUTO', callback_data: 'toggle_auto' }],
            [
                { text: '₿ BTC/USD', callback_data: 'scan_BTCUSD' },
                { text: 'Ξ ETH/USD', callback_data: 'scan_ETHUSD' }
            ],
            [
                { text: '☀️ SOL/USD', callback_data: 'scan_SOLUSD' },
                { text: '🔶 BNB/USD', callback_data: 'scan_BNBUSD' }
            ],
            [
                { text: '📊 EXECUTE BET', callback_data: 'execute_manual' },
                { text: '🔄 REFRESH', callback_data: 'refresh' }
            ]
        ]
    }
});

// --- 4. COMMAND HANDLERS ---

// /start - Launch the Menu
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;

    // Fetch Wallet Balance
    const balanceWei = await provider.getBalance(wallet.address);
    const balanceEth = ethers.formatEther(balanceWei);

    const welcome = `💎 **AI TRADING TERMINAL v5.0**\n\n` +
                    `👤 **Admin:** \`Authenticated\`\n` +
                    `👛 **Wallet:** \`${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}\`\n` +
                    `💰 **Balance:** \`${balanceEth} ETH\`\n\n` +
                    `⚙️ **Bet Size:** \`${settings.tradeAmountCAD} CAD\``;

    bot.sendMessage(msg.chat.id, welcome, getDashboard());
});

// /amount [Value] - Set Bet Size
bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (msg.from.id !== adminId) return;
    settings.tradeAmountCAD = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Bet size set to **${settings.tradeAmountCAD} CAD**`);
});

// /address [0x...] - Set Payout Destination
bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    if (msg.from.id !== adminId) return;
    settings.payoutAddress = match[1];
    bot.sendMessage(msg.chat.id, `🎯 Payout address set to: \`${settings.payoutAddress}\``, { parse_mode: 'Markdown' });
});

// --- 5. INTERACTIVE BUTTON LOGIC ---

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data === 'toggle_auto') {
        settings.isAuto = !settings.isAuto;
        bot.editMessageText(`💎 **AI TRADING TERMINAL**\n\nAuto-Mode: ${settings.isAuto ? "✅ `ON`" : "🛑 `OFF`"}`, {
            chat_id: chatId, message_id: msgId, ...getDashboard()
        });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1];
        bot.answerCallbackQuery(query.id, { text: `Scanning ${asset}...` });
        
        // Fetch News & Technicals
        const result = await runAIScan(asset);
        const report = `🎯 **Result: ${asset}**\n` +
                       `Signal: \`${result.signal}\`\n` +
                       `Confidence: \`${result.conf}%\` | RSI: \`${result.rsi}\`\n\n` +
                       `_Targeting ${settings.tradeAmountCAD} CAD Entry_`;

        bot.editMessageText(report, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }

    if (query.data === 'execute_manual') {
        if (!settings.payoutAddress) {
            return bot.answerCallbackQuery(query.id, { text: "❌ Error: Set /address first!", show_alert: true });
        }
        
        bot.sendMessage(chatId, `🚀 **Signing Blockchain Transaction...**\nSending bet to contract...`);
        // Actual logic to send ETH would go here using wallet.sendTransaction
    }

    bot.answerCallbackQuery(query.id);
});

// AI Logic Function
async function runAIScan(asset) {
    // Simulated live logic
    return {
        signal: Math.random() > 0.5 ? "HIGHER 📈" : "LOWER 📉",
        conf: Math.floor(Math.random() * (90 - 65) + 65),
        rsi: 34,
        sentiment: 0.6
    };
}

console.log(`🚀 Terminal Online. Access granted to ID: ${adminId}`);
