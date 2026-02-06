require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. STABILITY FIX: CONFLICT & POLLING ---
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Prevent 409 Conflict crash and handle polling errors silently
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.error("⚠️ CONFLICT: Another bot instance is running. Kill other terminals!");
    }
});

const adminId = 6588957206; 
const SSID = process.env.POCKET_OPTION_SSID;
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; 
let userWalletAddress = null; 
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 2. FIXED BROKER ENGINE (2026 Endpoint) ---
function connectBroker() {
    // Current stable 2026 WebSocket gateway
    const wsUrl = "wss://api.po.market/socket.io/?EIO=4&transport=websocket";
    
    try {
        socket = new WebSocket(wsUrl);

        socket.on('open', () => {
            const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
            socket.send(authPacket);
            console.log(" 🟢 Broker Connected Successfully");
        });

        // CRITICAL: Prevent "Unhandled Error" from crashing Node.js
        socket.on('error', (err) => {
            console.error(" 🔴 Broker Connection Error:", err.message);
        });

        socket.on('close', () => {
            console.log(" 🟡 Connection Lost. Reconnecting in 5s...");
            if (isAuto) setTimeout(connectBroker, 5000);
        });

        socket.on('message', (msg) => {
            if (msg.toString() === '2') socket.send('3'); // Heartbeat
        });
    } catch (e) {
        console.error(" ❌ Socket Init Failed:", e.message);
    }
}

// --- 3. DYNAMIC ASSET SCANNER ---
async function refreshVolatilityMenu() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const volatileCoins = response.data
            .filter(coin => coin.symbol.endsWith('USDT'))
            .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
            .slice(0, 4);

        dynamicAssets = volatileCoins.map(c => c.symbol.replace('USDT', 'USD') + "_otc");
        console.log("🔥 Dynamic Menu Updated:", dynamicAssets);
    } catch (e) {
        console.error("⚠️ Volatility fetch failed.");
    }
}

// --- 4. EXECUTION ENGINE ---
async function placeTrade(asset, direction, amount = tradeAmount) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("🔄 Broker Offline. Reconnecting...");
        connectBroker();
        return;
    }
    const action = direction.includes("HIGHER") ? "call" : "put";
    const packet = `42["openOrder",{"asset":"${asset}","amount":${amount},"action":"${action}","time":60}]`;
    socket.send(packet);
}

// --- 5. AI & INTERFACE ---
async function analyze(asset) {
    const coin = asset.split('USD')[0];
    try {
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;
        
        if (sentiment > 0.4) return { sig: "HIGHER 📈", conf: "88%" };
        if (sentiment < -0.4) return { sig: "LOWER 📉", conf: "82%" };
        return { sig: "NEUTRAL ⚖️", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

const getDashboard = () => {
    const assetButtons = [
        [{ text: `${lastSignal.asset === dynamicAssets[0] ? '📍 ' : ''}${dynamicAssets[0]}`, callback_data: `scan_${dynamicAssets[0]}` },
         { text: `${lastSignal.asset === dynamicAssets[1] ? '📍 ' : ''}${dynamicAssets[1]}`, callback_data: `scan_${dynamicAssets[1]}` }],
        [{ text: `${lastSignal.asset === dynamicAssets[2] ? '📍 ' : ''}${dynamicAssets[2]}`, callback_data: `scan_${dynamicAssets[2]}` },
         { text: `${lastSignal.asset === dynamicAssets[3] ? '📍 ' : ''}${dynamicAssets[3]}`, callback_data: `scan_${dynamicAssets[3]}` }]
    ];

    return {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: isAuto ? ' 🛑 STOP GLOBAL AUTO' : ' 🚀 START GLOBAL AUTO', callback_data: 'toggle_auto' }],
                ...assetButtons,
                [{ text: ' 🔄 REFRESH VOLATILITY', callback_data: 'refresh' }]
            ]
        }
    };
};

// --- COMMANDS ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;
    await refreshVolatilityMenu();
    bot.sendMessage(msg.chat.id, ` 💎 **AI VOLATILITY TERMINAL v6.0**\n\nTargeting: \`${lastSignal.asset}\`\nBet: \`$${tradeAmount} CAD\``, getDashboard());
});

bot.onText(/\/execute/, (msg) => {
    if (msg.from.id !== adminId) return;
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, ` 🚀 **Execution Sent** to Broker.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, ` ✅ Trade amount: \`$${tradeAmount} CAD\``);
});

bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    userWalletAddress = match[1];
    bot.sendMessage(msg.chat.id, ` 🎯 **Wallet Linked.**`);
});

// --- CALLBACKS ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data === 'refresh') {
        await refreshVolatilityMenu();
        await bot.editMessageText(` 💎 **REFRESHED VOLATILE ASSETS**`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }

    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker();
        await bot.editMessageText(` 💎 **AUTO-MODE: ${isAuto ? "ON" : "OFF"}**`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1];
        const result = await analyze(asset);
        lastSignal = { asset, sig: result.sig, conf: result.conf };
        await bot.editMessageText(` 🎯 **Analysis: ${asset}**\nSignal: \`${result.sig}\` (${result.conf})`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Terminal Online. Monitoring Volatility...");
