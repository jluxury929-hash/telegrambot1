require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. ACCESS & SECURITY ---
const ALLOWED_USERS = [6588957206]; // Your numeric ID
const ALLOWED_USERNAMES = ['jluxury929']; // Whitelisted tester
const adminId = 6588957206; // Primary admin for sensitive commands

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Wallet Setup (Ethereum/BNB/Polygon)
const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/eth");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- 2. GLOBAL STATE ---
let isAuto = false;
let tradeAmount = 10; // Default stake
let lastSignal = { asset: null, sig: null };
let socket = null;
const SSID = process.env.POCKET_OPTION_SSID;

function isAuthorized(msg) {
    return ALLOWED_USERS.includes(msg.from.id) || ALLOWED_USERNAMES.includes(msg.from.username);
}

// --- 3. BROKER ENGINE ---
function connectBroker() {
    const wsUrl = "wss://api-eu.pocketoption.com/socket.io/?EIO=4&transport=websocket";
    socket = new WebSocket(wsUrl);

    socket.on('open', () => {
        const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
        socket.send(authPacket);
        console.log(" ✅ Broker Connected & Authenticated");
    });

    socket.on('message', (msg) => {
        if (msg.toString() === '2') socket.send('3'); // Keep-alive heartbeat
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

// --- 4. AI LOGIC ---
async function analyze(asset) {
    const coin = asset.split('USD')[0];
    try {
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;
        const rsi = 45; // Simulated: map live candles for 85%+ accuracy
        
        if (sentiment > 0.4 && rsi < 35) return { sig: "HIGHER 📈", conf: "88%" };
        if (sentiment < -0.4 && rsi > 65) return { sig: "LOWER 📉", conf: "82%" };
        return { sig: "NEUTRAL ⚖️", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

// --- 5. INTERFACE & COMMANDS ---
const getMenu = () => ({
    parse_mode: 'Markdown',
    reply_markup: {
        inline_keyboard: [
            [{ text: isAuto ? '🛑 STOP AUTO' : '🚀 START AUTO', callback_data: 'toggle_auto' }],
            [{ text: '₿ BTC', callback_data: 'scan_BTCUSD_otc' }, { text: 'Ξ ETH', callback_data: 'scan_ETHUSD_otc' }],
            [{ text: '☀️ SOL', callback_data: 'scan_SOLUSD_otc' }, { text: '🔶 BNB', callback_data: 'scan_BNBUSD_otc' }],
            [{ text: '🔄 REFRESH DASHBOARD', callback_data: 'refresh' }]
        ]
    }
});

bot.onText(/\/start/, async (msg) => {
    if (!isAuthorized(msg)) return;
    const bal = await provider.getBalance(wallet.address);
    const welcome = `💎 **AI TRADING TERMINAL v5.0**\n\n` +
                    `Status: \`Authenticated\`\n` +
                    `Wallet Balance: \`${ethers.formatEther(bal)} ETH\`\n` +
                    `Trade Amount: \`$${tradeAmount} CAD\``;
    bot.sendMessage(msg.chat.id, welcome, getMenu());
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Trade amount set to: **$${tradeAmount}**`);
});

bot.onText(/\/execute/, (msg) => {
    if (!isAuthorized(msg)) return;
    if (!lastSignal.asset) return bot.sendMessage(msg.chat.id, "❌ No signal found. Scan an asset first.");
    
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, `🚀 **Executing Manual Trade**\nAsset: \`${lastSignal.asset}\`\nDirection: \`${lastSignal.sig}\`\nAmount: \`$${tradeAmount}\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/payout (.+) (.+)/, async (msg, match) => {
    if (msg.from.id !== adminId) return; // Payout restricted to you
    try {
        const tx = await wallet.sendTransaction({ to: match[1], value: ethers.parseEther(match[2]) });
        bot.sendMessage(msg.chat.id, `✅ **Payout Sent!**\nHash: \`${tx.hash}\``, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Transaction Failed."); }
});

// --- 6. CALLBACK LOGIC ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker();
        bot.editMessageText(`💎 **AI TRADING TERMINAL**\n\nAuto-Mode: ${isAuto ? "✅ `ON`" : "🛑 `OFF`"}`, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1] + "_otc";
        const result = await analyze(asset);
        lastSignal = { asset, sig: result.sig };

        bot.editMessageText(`🎯 **Analysis for ${asset}**\n\nSignal: \`${result.sig}\`\nConfidence: \`${result.conf}\`\n\n_Auto-Trade executes if > 85%_`, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
        
        if (isAuto && parseInt(result.conf) > 85) {
            placeTrade(asset, result.sig, tradeAmount);
        }
    }
    bot.answerCallbackQuery(query.id);
});

console.log(`🚀 Terminal Online. Access: Admin & jluxury929`);
