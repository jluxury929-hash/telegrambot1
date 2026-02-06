require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. CONFIG ---
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const adminId = 6588957206; 
const SSID = process.env.POCKET_OPTION_SSID;

// --- 2. THE HUMANIZED BROKER CONNECTION ---
function connectBroker(chatId) {
    const wsUrl = "wss://api.po.market/socket.io/?EIO=4&transport=websocket";
    
    // HUMAN IDENTITY: Mimics the exact fingerprint of the launcher
    const options = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Origin": "https://pocketoption.com",
            "Accept-Language": "en-US,en;q=0.9",
            "Host": "api.po.market"
        }
    };

    try {
        if (socket) socket.terminate();
        socket = new WebSocket(wsUrl, options);

        socket.on('open', () => {
            // Add a "Human Thinking" delay before auth
            setTimeout(() => {
                const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
                socket.send(authPacket);
                console.log("🟢 Stealth Auth Success");
            }, 1200);
        });

        // CRITICAL: Handle the 403 gracefully so the bot doesn't die
        socket.on('error', (err) => {
            console.error("❌ 403 Blocked:", err.message);
            if (chatId) bot.sendMessage(chatId, "⚠️ **Security Blocked (403).** Re-run the launcher to refresh your browser session.");
        });

        socket.on('message', (msg) => {
            const raw = msg.toString();
            if (raw === '2') socket.send('3'); // Heartbeat

            if (raw.startsWith('42["order_closed"')) {
                const data = JSON.parse(raw.substring(2))[1];
                const profitUSD = data.profit - data.amount;
                const status = profitUSD > 0 ? "💰 WIN" : "📉 LOSS";
                bot.sendMessage(chatId, `📊 **RESULT:** ${status}\nAsset: \`${data.asset}\` | CAD: \`$${(profitUSD * 1.36).toFixed(2)}\``);
            }
        });

    } catch (e) { console.error("Socket Exception:", e.message); }
}

// ... rest of your analyze and refreshVolatilityMenu functions ...

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) {
            connectBroker(chatId);
            // Wait 2-5 seconds (human delay) before first analysis
            setTimeout(() => runAutoPilot(chatId), 2000 + Math.random() * 3000);
        }
    }
});
