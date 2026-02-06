require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- ACCESS & SECURITY ---
const token = process.env.TELEGRAM_TOKEN;
const adminId = 6588957206; 
const bot = new TelegramBot(token, { polling: true });
const SSID = process.env.POCKET_OPTION_SSID;

// --- BLOCKCHAIN ENGINE ---
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; 
let userWalletAddress = null; 
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" }; // Default start
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 1. DYNAMIC ASSET SCANNER (Volatility Logic) ---
async function refreshVolatilityMenu() {
    try {
        // Fetch 24h ticker data to find coins with highest percentage change (Volatility)
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const volatileCoins = response.data
            .filter(coin => coin.symbol.endsWith('USDT'))
            // Sort by absolute price change percentage (highest movement first)
            .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
            .slice(0, 4);

        dynamicAssets = volatileCoins.map(c => c.symbol.replace('USDT', 'USD') + "_otc");
        console.log("🔥 Dynamic Menu Updated with Volatile Assets:", dynamicAssets);
    } catch (e) {
        console.error("⚠️ Volatility fetch failed, using defaults.");
    }
}

// --- 2. THE EXECUTION ENGINE (Broker) ---
function connectBroker() {
    const wsUrl = "wss://api-eu.pocketoption.com/socket.io/?EIO=4&transport=websocket";
    socket = new WebSocket(wsUrl);
    socket.on('open', () => {
        const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
        socket.send(authPacket);
        console.log(" 🟢 Broker Connected & Authenticated");
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

// --- 3. THE AI PREDICTOR (News Analysis) ---
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

// --- 4. THE APP INTERFACE ---
const getDashboard = () => {
    // Buttons match the dynamically fetched volatile assets
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

// --- COMMAND HANDLERS ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;
    await refreshVolatilityMenu();
    const appTitle = ` 💎 **AI VOLATILITY TERMINAL v6.0**\n\n` +
                     `Targeting: \`${lastSignal.asset}\`\n` +
                     `Wallet: \`${userWalletAddress || "None Linked"}\`\n` +
                     `Bet: \`$${tradeAmount} CAD\`\n\n` +
                     `_Menu displays today's most dynamic assets._`;
    bot.sendMessage(msg.chat.id, appTitle, getDashboard());
});

bot.onText(/\/execute/, (msg) => {
    if (msg.from.id !== adminId) return;
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, ` 🚀 **Execution Sent**\nAsset: \`${lastSignal.asset}\`\nBet: \`$${tradeAmount} CAD\``, { parse_mode: 'Markdown' });
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, ` ✅ Trade amount: \`$${tradeAmount} CAD\``);
});

bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    userWalletAddress = match[1];
    bot.sendMessage(msg.chat.id, ` 🎯 **Wallet Destination Linked.**`);
});

// --- CALLBACK LOGIC ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data === 'refresh') {
        await refreshVolatilityMenu();
        await bot.editMessageText(` 💎 **REFRESHED VOLATILE ASSETS**\nStatus: \`Authenticated\``, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }

    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1];
        await bot.answerCallbackQuery(query.id, { text: `AI analyzing ${asset}...` });
        
        const result = await analyze(asset);
        lastSignal = { asset: asset, sig: result.sig, conf: result.conf };

        const report = ` 🎯 **Analysis: ${asset}**\nSignal: \`${result.sig}\` (${result.conf})\n\n` +
                       `📍 _Selection Locked._ You can now use /execute for this coin.`;

        await bot.editMessageText(report, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    bot.answerCallbackQuery(query.id);
});
