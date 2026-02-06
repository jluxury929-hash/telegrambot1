require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- ACCESS & SECURITY ---
const adminId = 6588957206; 
const ALLOWED_USERNAMES = ['jluxury929']; 
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const SSID = process.env.POCKET_OPTION_SSID;

// --- BLOCKCHAIN ENGINE ---
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; 
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };

function isAuthorized(msg) {
    return msg.from.id === adminId || ALLOWED_USERNAMES.includes(msg.from.username);
}

// --- 1. THE EXECUTION ENGINE ---
function connectBroker() {
    const wsUrl = "wss://api-eu.pocketoption.com/socket.io/?EIO=4&transport=websocket";
    socket = new WebSocket(wsUrl);

    socket.on('open', () => {
        const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
        socket.send(authPacket);
        console.log(" Broker Connected & Authenticated");
    });

    socket.on('message', (msg) => {
        if (msg.toString() === '2') socket.send('3');
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
        
        if (sentiment > 0.4 && rsi < 35) return { sig: "HIGHER ", conf: "88%" };
        if (sentiment < -0.4 && rsi > 65) return { sig: "LOWER ", conf: "82%" };
        return { sig: "NEUTRAL ", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

// --- 3. THE APP INTERFACE ---
const getMenu = () => ({
    parse_mode: 'Markdown',
    reply_markup: {
        inline_keyboard: [
            [{ text: isAuto ? ' STOP AUTO' : ' START AUTO', callback_data: 'toggle_auto' }],
            [{ text: '₿ BTC', callback_data: 'scan_BTCUSD_otc' }, { text: 'Ξ ETH', callback_data: 'scan_ETHUSD_otc' }],
            [{ text: ' SOL', callback_data: 'scan_SOLUSD_otc' }, { text: ' BNB', callback_data: 'scan_BNBUSD_otc' }],
            [{ text: ' REFRESH DASHBOARD', callback_data: 'refresh' }]
        ]
    }
});

// --- COMMAND HANDLERS ---

// /start now triggers an immediate scan for BTC so you get a signal right away
bot.onText(/\/start/, async (msg) => {
    if (!isAuthorized(msg)) return;
    
    // Immediate Initial Scan
    const initialResult = await analyze("BTCUSD_otc");
    lastSignal = { asset: "BTCUSD_otc", sig: initialResult.sig, conf: initialResult.conf };

    const startMsg = ` **AI TRADING TERMINAL v5.0**\n\n` +
                     `Status: \`Online\`\n` +
                     `Initial Scan (BTC): \`${initialResult.sig}\` (${initialResult.conf})\n\n` +
                     `_Type /execute to bet or /amount to change stake._`;
                     
    bot.sendMessage(msg.chat.id, startMsg, getMenu());
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (!isAuthorized(msg)) return;
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Trade amount set to: \`$${tradeAmount} CAD\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/execute/, (msg) => {
    if (!isAuthorized(msg)) return;
    if (lastSignal.sig.includes("WAITING") || lastSignal.sig.includes("NEUTRAL")) {
        return bot.sendMessage(msg.chat.id, "❌ No valid high-confidence signal to execute.");
    }
    
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, `🚀 **Executing Manual Trade**\nAsset: \`${lastSignal.asset}\`\nDirection: \`${lastSignal.sig}\`\nAmount: \`$${tradeAmount}\``, { parse_mode: 'Markdown' });
});

// --- CALLBACK LOGIC ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker();
        bot.editMessageText(` **AI TRADING TERMINAL**\n\nAuto-Mode: ${isAuto ? " `ON`" : " `OFF`"}`, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1] + "_otc";
        const result = await analyze(asset);
        lastSignal = { asset, sig: result.sig, conf: result.conf };

        bot.editMessageText(` **Analysis for ${asset}**\n\nSignal: \`${result.sig}\`\nConfidence: \`${result.conf}\`\n\n_Auto-Trade will execute if confidence > 85%_`, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
       
        if (isAuto && parseInt(result.conf) > 85) {
            placeTrade(asset, result.sig);
        }
    }

    if (query.data === 'refresh') {
        bot.editMessageText(` **AI TRADING TERMINAL v5.0**\n\nStatus: \`Online\``, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
    }
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Terminal Online. Access: Admin & jluxury929");
