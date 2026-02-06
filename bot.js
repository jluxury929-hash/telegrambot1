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
let wallet = null; // Loaded via /connect
let userWalletAddress = null; // Linked via /address
const USD_TO_CAD = 1.36; // Feb 2026 Exchange Rate

// --- 3. GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; // CAD
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 4. BROKER & PROFIT ENGINE ---
function connectBroker(chatId) {
    const wsUrl = "wss://api.po.market/socket.io/?EIO=4&transport=websocket";
    try {
        socket = new WebSocket(wsUrl);
        socket.on('open', () => {
            const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
            socket.send(authPacket);
            console.log(" 🟢 Broker Connected");
        });
        socket.on('message', (msg) => {
            const raw = msg.toString();
            if (raw === '2') socket.send('3');
            if (raw.startsWith('42["order_closed"')) {
                const data = JSON.parse(raw.substring(2))[1];
                const profitUSD = data.profit - data.amount;
                const profitCAD = (profitUSD * USD_TO_CAD).toFixed(2);
                bot.sendMessage(chatId, `💰 **TRADE CLOSED**\nAsset: \`${data.asset}\`\nNet: \`$${profitCAD} CAD\``, { parse_mode: 'Markdown' });
            }
        });
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
        const resp = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const sorted = resp.data
            .filter(i => i.symbol.endsWith('USDT'))
            .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
            .slice(0, 4);
        dynamicAssets = sorted.map(i => i.symbol.replace('USDT', 'USD') + "_otc");
    } catch (e) { console.error("Volatility fetch failed."); }
}

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
    const balText = wallet ? `\`${ethers.formatEther(await provider.getBalance(wallet.address)).slice(0,6)} ETH\`` : "Disconnected";
    bot.sendMessage(msg.chat.id, `💎 **AI TERMINAL**\n\nWallet: \`${userWalletAddress || "None"}\`\nGas: ${balText}\nBet: \`$${tradeAmount} CAD\``, getDashboard());
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    if (msg.from.id !== adminId) return;
    const input = match[1].trim();
    try {
        bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}); // Security delete
        if (input.split(" ").length >= 12) {
            wallet = ethers.Wallet.fromPhrase(input, provider);
        } else {
            wallet = new ethers.Wallet(input.startsWith('0x') ? input : `0x${input}`, provider);
        }
        userWalletAddress = wallet.address;
        bot.sendMessage(msg.chat.id, `✅ **Wallet Connected!**\nAddress: \`${wallet.address}\``, { parse_mode: 'Markdown' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Invalid Seed or Key."); }
});

bot.onText(/\/address (0x[a-fA-F0-9]{40})/, (msg, match) => {
    userWalletAddress = match[1];
    wallet = null; // Revert to read-only
    bot.sendMessage(msg.chat.id, `👁️ **Read-Only Mode** linked to \`${userWalletAddress}\``);
});

bot.onText(/\/execute/, async (msg) => {
    if (msg.from.id !== adminId) return;
    if (!wallet) return bot.sendMessage(msg.chat.id, "❌ **Error**: Use `/connect` to enable trading.");
    placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
    bot.sendMessage(msg.chat.id, `🚀 **Executing...**`);
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, ` ✅ Stake: \`$${tradeAmount} CAD\``);
});

// --- CALLBACKS ---
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
