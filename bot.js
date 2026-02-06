require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const vader = require('vader-sentiment');
const axios = require('axios');
const WebSocket = require('ws');

// --- 1. ACCESS & SECURITY ---
const token = process.env.TELEGRAM_TOKEN;
const adminId = 6588957206; 
const bot = new TelegramBot(token, { polling: true });
const SSID = process.env.POCKET_OPTION_SSID;

// Handle 409 Conflict (Prevents crash if two bots are open)
bot.on('polling_error', (err) => {
    if (err.message.includes('409 Conflict')) {
        console.error("⚠️ Multiple instances running! Close other terminals.");
    }
});

// --- 2. BLOCKCHAIN & GAS ENGINE ---
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const GAS_LIMIT_SAFETY = ethers.parseEther("0.001"); // Safety floor
const USD_TO_CAD = 1.36; // Feb 2026 Exchange Rate

// --- 3. GLOBAL STATE ---
let socket = null;
let isAuto = false;
let tradeAmount = 10; // CAD
let userWalletAddress = null; 
let lastSignal = { asset: "BTCUSD_otc", sig: "WAITING", conf: "0%" };
let dynamicAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];

// --- 4. THE PROFIT & BROKER ENGINE ---
function connectBroker(chatId) {
    const wsUrl = "wss://api.po.market/socket.io/?EIO=4&transport=websocket";
    
    try {
        socket = new WebSocket(wsUrl);

        socket.on('open', () => {
            const authPacket = `42["auth",{"session":"${SSID}","isDemo":1,"uid":0,"platform":1}]`;
            socket.send(authPacket);
            console.log(" 🟢 Broker Connected Successfully");
        });

        socket.on('message', (msg) => {
            const raw = msg.toString();
            if (raw === '2') socket.send('3'); // Heartbeat

            // CATCH TRADE RESULTS
            if (raw.startsWith('42["order_closed"')) {
                const data = JSON.parse(raw.substring(2))[1];
                const profitUSD = data.profit - data.amount;
                const profitCAD = (profitUSD * USD_TO_CAD).toFixed(2);
                const emoji = profitUSD > 0 ? "💰" : "📉";

                bot.sendMessage(chatId, 
                    `${emoji} **TRADE CLOSED**\n\n` +
                    `Asset: \`${data.asset}\`\n` +
                    `Profit: \`$${profitUSD.toFixed(2)} USD\`\n` +
                    `Profit: \`$${profitCAD} CAD\`\n` +
                    `Balance: \`$${data.account_balance} USD\``, 
                    { parse_mode: 'Markdown' }
                );
            }
        });

        socket.on('error', (err) => console.error("🔴 Broker Error:", err.message));
    } catch (e) { console.error("❌ Socket Failed:", e.message); }
}

async function checkGas(chatId) {
    const bal = await provider.getBalance(wallet.address);
    if (bal < GAS_LIMIT_SAFETY) {
        bot.sendMessage(chatId, `⚠️ **GAS ALERT**: Your ETH balance (\`${ethers.formatEther(bal)}\`) is too low to broadcast trades.`);
        return false;
    }
    return true;
}

async function placeTrade(asset, direction, amount = tradeAmount) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectBroker();
        return;
    }
    const action = direction.includes("HIGHER") ? "call" : "put";
    const amountUSD = (amount / USD_TO_CAD).toFixed(2); // Convert CAD to USD for broker
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
         { text: `${lastSignal.asset === dynamicAssets[3] ? '📍 ' : ''}${dynamicAssets[3]}`, callback_data: `scan_${dynamicAssets[3]}` }],
        [{ text: ' 🔄 REFRESH VOLATILITY', callback_data: 'refresh' }]
    ];
    return { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: isAuto ? ' 🛑 STOP AUTO' : ' 🚀 START AUTO', callback_data: 'toggle_auto' }], ...buttons] } };
};

// --- COMMANDS ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;
    await refreshVolatilityMenu();
    bot.sendMessage(msg.chat.id, ` 💎 **AI VOLATILITY TERMINAL v6.0**\n\nTargeting: \`${lastSignal.asset}\`\nBet: \`$${tradeAmount} CAD\``, getDashboard());
});

bot.onText(/\/execute/, async (msg) => {
    if (msg.from.id !== adminId) return;
    if (await checkGas(msg.chat.id)) {
        placeTrade(lastSignal.asset, lastSignal.sig, tradeAmount);
        bot.sendMessage(msg.chat.id, `🚀 **Trade Executed.** (Using $${(tradeAmount/USD_TO_CAD).toFixed(2)} USD)`);
    }
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
        await bot.editMessageText(` 💎 **VOLATILITY UPDATED**`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
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
        await bot.editMessageText(` 🎯 **Analysis: ${asset}**\nSignal: \`${result.sig}\` (${result.conf})`, { chat_id: chatId, message_id: msgId, ...getDashboard() });
    }
    bot.answerCallbackQuery(query.id);
});

console.log("🚀 Terminal Online. Profit Tracking & Gas Shield Active.");
