require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. CONFIG & AUTH ---
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const adminId = 6588957206; 

// --- 2. GLOBAL STATE ---
let isAuto = false;
let tradeAmount = 10; // Default CAD
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 3. THE START MENU UI ---
const getMainMenu = () => {
    return {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                // Row 1: The big toggle button
                [{ text: isAuto ? '🛑 STOP AUTO-PILOT' : '🚀 START AUTO-PILOT', callback_data: 'toggle_auto' }],
                
                // Row 2: Asset Scanning
                [{ text: `🔍 SCAN ${dynamicAssets[0]}`, callback_data: `scan_${dynamicAssets[0]}` },
                 { text: `🔍 SCAN ${dynamicAssets[1]}`, callback_data: `scan_${dynamicAssets[1]}` }],
                
                // Row 3: Asset Scanning
                [{ text: `🔍 SCAN ${dynamicAssets[2]}`, callback_data: `scan_${dynamicAssets[2]}` },
                 { text: `🔍 SCAN ${dynamicAssets[3]}`, callback_data: `scan_${dynamicAssets[3]}` }],
                
                // Row 4: Utility
                [{ text: '🔄 REFRESH MARKETS', callback_data: 'refresh' },
                 { text: '💰 STATUS', callback_data: 'status' }]
            ]
        }
    };
};

// --- 4. COMMAND: /start ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;

    const welcomeMsg = 
        `💎 **AI STEALTH TERMINAL**\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Status: \`Online\`\n` +
        `Mode: \`Ghost-Stealth 2026\`\n` +
        `Current Stake: \`$${tradeAmount} CAD\`\n\n` +
        `*Select an option below to begin:*`;

    bot.sendMessage(msg.chat.id, welcomeMsg, getMainMenu());
});

// --- 5. HANDLING BUTTON CLICKS ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    // Acknowledge the click (removes the "loading" circle on the button)
    bot.answerCallbackQuery(query.id);

    if (data === 'toggle_auto') {
        isAuto = !isAuto;
        const status = isAuto ? "ACTIVATED" : "DEACTIVATED";
        
        // Update the menu to show the new button state
        bot.editMessageText(`💎 **AUTO-PILOT ${status}**\nAdjusting systems...`, {
            chat_id: chatId,
            message_id: messageId,
            ...getMainMenu()
        });

        if (isAuto) {
            // Your logic to start the automated trading loop
            console.log("Auto-Pilot Started");
        }
    }

    if (data === 'refresh') {
        // Logic to update dynamicAssets from Binance/API
        bot.editMessageText(`🔄 **MARKETS REFRESHED**\nUpdating volatility data...`, {
            chat_id: chatId,
            message_id: messageId,
            ...getMainMenu()
        });
    }

    if (data.startsWith('scan_')) {
        const asset = data.split('_')[1] + "_otc";
        bot.sendMessage(chatId, `🎯 **Scanning ${asset}...**`);
        // Trigger your analyze(asset) function here
    }

    if (data === 'status') {
        bot.sendMessage(chatId, `📈 **SYSTEM STATUS**\nConnection: \`Secure\`\nBridge: \`Active\`\nWallet: \`Linked\``);
    }
});

// --- 6. UTILITY COMMANDS ---
bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (msg.from.id !== adminId) return;
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Trade amount set to \`$${tradeAmount} CAD\``);
});

console.log("🚀 Bot is live. Type /start in Telegram.");
