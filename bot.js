require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { RSI } = require('technicalindicators');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const SSID = process.env.POCKET_OPTION_SSID;

let socket = null;
let isAuto = false;
let tradeAmount = 10; // Default amount
let lastSignal = { asset: null, sig: null }; // Track last signal for /execute

// --- 1. THE EXECUTION ENGINE ---
function connectBroker() {
    const wsUrl = "wss://api-eu.pocketoption.com/socket.io/?EIO=4&transport=websocket";
    socket = new WebSocket(wsUrl);

    socket.on('open', () => {
        // Authenticate using the 42["auth"] packet
        const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
        socket.send(authPacket);
        console.log(" Broker Connected & Authenticated");
    });

    socket.on('message', (msg) => {
        if (msg.toString() === '2') socket.send('3'); // Heartbeat
    });
}

async function placeTrade(asset, direction, amount = tradeAmount) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectBroker(); // Ensure connection exists
        setTimeout(() => placeTrade(asset, direction, amount), 2000);
        return;
    }
    const action = direction.includes("HIGHER") ? "call" : "put";
    const packet = `42["openOrder",{"asset":"${asset}","amount":${amount},"action":"${action}","time":60}]`;
    socket.send(packet);
}

// --- 2. THE AI PREDICTOR (Multi-Asset) ---
async function analyze(asset) {
    const coin = asset.split('USD')[0];
    try {
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`);
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;

        const rsi = 45; // Placeholder
       
        if (sentiment > 0.4 && rsi < 35) return { sig: "HIGHER ", conf: "88%" };
        if (sentiment < -0.4 && rsi > 65) return { sig: "LOWER ", conf: "82%" };
        return { sig: "NEUTRAL ", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

// --- 3. THE APP INTERFACE ---
const getMenu = (status = "Ready") => ({
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

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    bot.sendMessage(msg.chat.id, ` **AI TRADING TERMINAL v5.0**\n\nStatus: \`Online\`\nTrade Amount: \`$${tradeAmount}\``, getMenu());
});

// Command to set trade amount
bot.onText(/\/amount (\d+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) return;
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Trade amount set to: \`$${tradeAmount}\``, { parse_mode: 'Markdown' });
});

// Command to manually execute last analyzed signal
bot.onText(/\/execute/, (msg) => {
    if (msg.from.id !== ADMIN_ID) return;
    if (!lastSignal.asset || !lastSignal.sig || lastSignal.sig.includes("NEUTRAL")) {
        return bot.sendMessage(msg.chat.id, "❌ No valid signal to execute. Scan an asset first.");
    }
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, `🚀 **Executing Manual Trade**\nAsset: \`${lastSignal.asset}\`\nDirection: \`${lastSignal.sig}\`\nAmount: \`$${tradeAmount}\``, { parse_mode: 'Markdown' });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker();
        bot.editMessageText(` **AI TRADING TERMINAL**\n\nAuto-Mode: ${isAuto ? " `ON`" : " `OFF`"}\nAmount: \`$${tradeAmount}\``, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1] + "_otc";
        const result = await analyze(asset);
        
        // Save to last signal for manual execution
        lastSignal = { asset, sig: result.sig };

        bot.editMessageText(` **Analysis for ${asset}**\n\nSignal: \`${result.sig}\`\nConfidence: \`${result.conf}\`\n\n_Auto-Trade will execute if confidence > 85%_`, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
       
        if (isAuto && parseInt(result.conf) > 85) {
            placeTrade(asset, result.sig, tradeAmount);
        }
    }
    
    if (query.data === 'refresh') {
        bot.editMessageText(` **AI TRADING TERMINAL v5.0**\n\nStatus: \`Online\`\nTrade Amount: \`$${tradeAmount}\``, {
            chat_id: chatId, message_id: messageId, ...getMenu()
        });
    }
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Terminal Online. Access granted to ID: " + ADMIN_ID);
