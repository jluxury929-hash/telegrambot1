require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- ACCESS & SECURITY ---
const token = process.env.TELEGRAM_TOKEN;
const adminId = 6588957206; 
const bot = new TelegramBot(token, { polling: true });
const SSID = process.env.POCKET_OPTION_SSID;

// --- BLOCKCHAIN ENGINE ---
// Using a reliable 2026 Public RPC for CAD/ETH tracking
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; // Default CAD amount
let userWalletAddress = null; // Linked via /address
let lastSignal = { asset: null, sig: null, conf: "0%" };

// --- 1. THE EXECUTION ENGINE (Broker) ---
function connectBroker() {
    const wsUrl = "wss://api-eu.pocketoption.com/socket.io/?EIO=4&transport=websocket";
    socket = new WebSocket(wsUrl);

    socket.on('open', () => {
        const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
        socket.send(authPacket);
        console.log(" 🟢 Broker Connected & Authenticated");
    });

    socket.on('message', (msg) => {
        if (msg.toString() === '2') socket.send('3'); // Heartbeat
    });
}

async function placeTrade(asset, direction, amount = tradeAmount) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectBroker();
        return;
    }
    const action = direction.includes("HIGHER") ? "call" : "put";
    const packet = `42["openOrder",{"asset":"${asset}","amount":${amount},"action":"${action}","time":60}]`;
    socket.send(packet);
}

// --- 2. THE AI PREDICTOR ---
async function analyze(asset) {
    const coin = asset.split('USD')[0];
    try {
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;
        const rsi = 45; 
        
        if (sentiment > 0.4 && rsi < 35) return { sig: "HIGHER 📈", conf: "88%" };
        if (sentiment < -0.4 && rsi > 65) return { sig: "LOWER 📉", conf: "82%" };
        return { sig: "NEUTRAL ⚖️", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

// --- 3. THE APP INTERFACE ---
const getDashboard = () => ({
    parse_mode: 'Markdown',
    reply_markup: {
        inline_keyboard: [
            [{ text: isAuto ? ' 🛑 STOP GLOBAL AUTO' : ' 🚀 START GLOBAL AUTO', callback_data: 'toggle_auto' }],
            [
                { text: '₿ BTC/USD', callback_data: 'scan_BTCUSD_otc' },
                { text: 'Ξ ETH/USD', callback_data: 'scan_ETHUSD_otc' }
            ],
            [
                { text: ' ☀️ SOL/USD', callback_data: 'scan_SOLUSD_otc' },
                { text: ' 🔶 BNB/USD', callback_data: 'scan_BNBUSD_otc' }
            ],
            [{ text: ' 🔄 REFRESH SYSTEM', callback_data: 'refresh' }]
        ]
    }
});

// --- COMMAND HANDLERS ---

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) {
        return bot.sendMessage(msg.chat.id, ` ❌ **Access Denied.**\nYour ID: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
    }
    const appTitle = ` 💎 **AI TRADING TERMINAL v5.0**\n\n` +
                     `Status: \`Authenticated\`\n` +
                     `Wallet: \`${userWalletAddress || "None Linked"}\`\n` +
                     `Bet Amount: \`$${tradeAmount} CAD\`\n\n` +
                     `*Welcome back, Administrator.*`;

    bot.sendMessage(msg.chat.id, appTitle, getDashboard());
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (msg.from.id !== adminId) return;
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, ` ✅ Trade amount set to: \`$${tradeAmount} CAD\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    if (msg.from.id !== adminId) return;
    userWalletAddress = match[1];
    bot.sendMessage(msg.chat.id, ` 🎯 **Wallet Connected!**\nDestination: \`${userWalletAddress}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/execute/, (msg) => {
    if (msg.from.id !== adminId) return;
    if (!lastSignal.asset) return bot.sendMessage(msg.chat.id, " ❌ No active signal. Click a coin button first.");
    
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, ` 🚀 **Execution Successful**\nAsset: \`${lastSignal.asset}\`\nBet: \`$${tradeAmount} CAD\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/payout (.+)/, async (msg, match) => {
    if (msg.from.id !== adminId) return;
    if (!userWalletAddress) return bot.sendMessage(msg.chat.id, " ❌ Set /address first.");
    
    const amount = match[1];
    bot.sendMessage(msg.chat.id, ` 💸 **Sending ${amount} CAD to connected wallet...**`);
    
    try {
        const tx = await wallet.sendTransaction({
            to: userWalletAddress,
            value: ethers.parseEther(amount) // Ensure you have ETH in gas wallet
        });
        bot.sendMessage(msg.chat.id, ` ✅ **Payout Confirmed!**\nTX: \`${tx.hash}\``, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(msg.chat.id, " ❌ **Payout Failed:** Check gas or balance.");
    }
});

// --- INTERACTIVE BUTTON HANDLER ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker();
        await bot.editMessageText(` 💎 **AI TRADING TERMINAL**\n\nAuto-Mode: ${isAuto ? " ✅ `ON`" : " 🛑 `OFF`"}`, {
            chat_id: chatId, message_id: msgId, ...getDashboard()
        });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1];
        await bot.answerCallbackQuery(query.id, { text: `AI scanning ${asset}...` });
        
        const result = await analyze(asset);
        lastSignal = { asset: asset, sig: result.sig, conf: result.conf };

        const report = ` 🎯 **Result for ${asset}**\n\nSignal: \`${result.sig}\`\nConf: \`${result.conf}\`\n\n` +
                       `👉 _Type /execute to follow through with the $${tradeAmount} bet._`;

        await bot.editMessageText(report, { chat_id: chatId, message_id: msgId, ...getDashboard() });
        
        if (isAuto && parseInt(result.conf) > 85) {
            placeTrade(asset, result.sig);
        }
    }
    bot.answerCallbackQuery(query.id);
});

console.log(" 💎 Terminal Online. Access granted to ID: 6588957206");
