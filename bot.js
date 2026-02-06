require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. INITIALIZATION & STABILITY ---
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const adminId = 6588957206; 
const SSID = process.env.POCKET_OPTION_SSID;

bot.on('polling_error', (err) => {
    if (err.message.includes('409 Conflict')) console.error("⚠️ Multiple instances running!");
});

// --- 2. DYNAMIC WALLET ENGINE ---
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
let wallet = null;
let userWalletAddress = null;
const USD_TO_CAD = 1.36;

// --- 3. GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10;
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 4. BROKER & PROFIT ENGINE ---
function connectBroker(chatId) {
    // UPDATED 2026 ENDPOINT
    const wsUrl = "wss://api.po.market/socket.io/?EIO=4&transport=websocket";
    
    // STEALTH HEADERS: Mimics a real Chrome browser to bypass 403 Forbidden
    const options = {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Origin": "https://pocketoption.com",
            "Host": "api.po.market"
        }
    };

    try {
        if (socket) {
            socket.terminate(); // Clean up old connections
        }

        socket = new WebSocket(wsUrl, options);

        socket.on('open', () => {
            const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
            socket.send(authPacket);
            console.log(" 🟢 Broker Connected");
            if (chatId) bot.sendMessage(chatId, "✅ **Authorized & Connected**");
        });

        // FIX: The "Anti-Crash" listener. Prevents 'Unhandled Error' events.
        socket.on('error', (err) => {
            console.error("❌ WebSocket Error (403/Forbidden):", err.message);
            if (chatId) {
                bot.sendMessage(chatId, "⚠️ **Connection Blocked (403).**\nYour SSID might be expired or your IP is flagged. Try refreshing the SSID with the launcher.");
            }
        });

        socket.on('message', (msg) => {
            const raw = msg.toString();
            if (raw === '2') socket.send('3'); // Heartbeat
            
            if (raw.startsWith('42["order_closed"')) {
                try {
                    const data = JSON.parse(raw.substring(2))[1];
                    const profitCAD = ((data.profit - data.amount) * USD_TO_CAD).toFixed(2);
                    bot.sendMessage(chatId, `💰 **TRADE CLOSED**\nAsset: \`${data.asset}\`\nNet: \`$${profitCAD} CAD\``, { parse_mode: 'Markdown' });
                } catch (e) { console.error("Parse Error:", e.message); }
            }
        });

        socket.on('close', () => console.log(" 🔴 Broker Disconnected"));

    } catch (e) { console.error("Socket Error:", e.message); }
}

async function placeTrade(asset, direction, amount) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const action = direction.includes("HIGHER") ? "call" : "put";
    const amountUSD = (amount / USD_TO_CAD).toFixed(2);
    const packet = `42["openOrder",{"asset":"${asset}","amount":${amountUSD},"action":"${action}","time":60}]`;
    socket.send(packet);
}

// --- 5. DYNAMIC MENU & AI ---
async function refreshVolatilityMenu() {
    try {
        const resp = await axios.get('https://api.binance.com/api/v3/ticker/24hr', { timeout: 5000 });
        const sorted = resp.data
            .filter(i => i.symbol.endsWith('USDT'))
            .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
            .slice(0, 4);
        dynamicAssets = sorted.map(i => i.symbol.replace('USDT', 'USD') + "_otc");
    } catch (e) { 
        console.error("Binance block/timeout. Using defaults."); 
        dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];
    }
}

async function analyze(asset) {
    const coin = asset.split('USD')[0];
    try {
        const news = await axios.get(`https://min-api.cryptocompare.com/data/v2/news/?categories=${coin}&lang=EN`, { timeout: 5000 });
        const headlines = news.data.Data.slice(0, 3).map(n => n.title).join(". ");
        const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(headlines).compound;
        if (sentiment > 0.4) return { sig: "HIGHER 📈", conf: "88%" };
        if (sentiment < -0.4) return { sig: "LOWER 📉", conf: "82%" };
        return { sig: "NEUTRAL ⚖️", conf: "15%" };
    } catch (e) { return { sig: "WAITING", conf: "0%" }; }
}

const getDashboard = () => {
    const buttons = [
        [{ text: `${lastSignal.asset === dynamicAssets[0] ? '📍 ' : ''}${dynamicAssets[0]}`, callback_data: `scan_${dynamicAssets[0]}` },
         { text: `${lastSignal.asset === dynamicAssets[1] ? '📍 ' : ''}${dynamicAssets[1]}`, callback_data: `scan_${dynamicAssets[1]}` }],
        [{ text: `${lastSignal.asset === dynamicAssets[2] ? '📍 ' : ''}${dynamicAssets[2]}`, callback_data: `scan_${dynamicAssets[2]}` },
         { text: `${lastSignal.asset === dynamicAssets[3] ? '📍 ' : ''}${dynamicAssets[3]}`, callback_data: `scan_${dynamicAssets[3]}` }]
    ];
    return { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: isAuto ? ' 🛑 STOP AUTO' : ' 🚀 START AUTO', callback_data: 'toggle_auto' }], ...buttons, [{ text: ' 🔄 REFRESH VOLATILITY', callback_data: 'refresh' }]] } };
};

// --- 6. COMMAND HANDLERS ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;
    await refreshVolatilityMenu();
    let balText = "Disconnected";
    if (wallet) {
        try {
            const bal = await provider.getBalance(wallet.address);
            balText = `\`${ethers.formatEther(bal).slice(0,6)} ETH\``;
        } catch(e) { balText = "0.00 ETH"; }
    }
    bot.sendMessage(msg.chat.id, `💎 **AI TERMINAL**\n\nWallet: \`${userWalletAddress || "None"}\`\nGas: ${balText}\nBet: \`$${tradeAmount} CAD\``, getDashboard());
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    if (msg.from.id !== adminId) return;
    const input = match[1].trim();
    try {
        bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}); 
        if (input.split(" ").length >= 12) {
            wallet = ethers.Wallet.fromPhrase(input, provider);
        } else {
            const formattedKey = input.startsWith("0x") ? input : "0x" + input;
            wallet = new ethers.Wallet(formattedKey, provider);
        }
        userWalletAddress = wallet.address;
        bot.sendMessage(msg.chat.id, `✅ **Wallet Connected!**\nAddress: \`${wallet.address}\``);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **Connection Failed**."); }
});

bot.onText(/\/execute/, async (msg) => {
    if (msg.from.id !== adminId) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectBroker(msg.chat.id);
        bot.sendMessage(msg.chat.id, "⏳ **Connecting... Try again in 2 seconds.**");
        return;
    }
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, `🚀 **Executing...**`);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    if (query.data === 'refresh') {
        await refreshVolatilityMenu();
        await bot.editMessageText(` 💎 **REFRESHED VOLATILITY**`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        if (isAuto) connectBroker(chatId);
        await bot.editMessageText(` 💎 **AUTO-MODE: ${isAuto ? "ON" : "OFF"}**`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    if (query.data.startsWith('scan_')) {
        const asset = query.data.split('_')[1];
        const result = await analyze(asset);
        lastSignal = { asset, sig: result.sig, conf: result.conf };
        await bot.editMessageText(`🎯 **Analysis: ${asset}**\nSignal: \`${result.sig}\` (${result.conf})`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Terminal Online. Ready for /connect or /address");
