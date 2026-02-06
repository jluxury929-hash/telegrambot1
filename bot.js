require('dotenv').config();
const { ethers } = require('ethers');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const vader = require('vader-sentiment');
const WebSocket = require('ws');

// --- CONFIG ---
const adminId = 6588957206; 
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const provider = new ethers.JsonRpcProvider("https://ethereum-rpc.publicnode.com");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// --- APP STATE (Memory System) ---
let state = {
    isAuto: false,
    tradeAmount: 10,
    selectedAsset: "BTCUSD_otc", // Remembers last selection
    topAssets: [],               // Dynamic menu coins
    lastAnalysis: null,
    payoutAddress: null
};

// --- DYNAMIC MENU LOGIC (Fetches Volatility) ---
async function refreshTopAssets() {
    try {
        // Fetch 24h market data to find highest volatility/change
        const resp = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
        const sorted = resp.data
            .filter(i => i.symbol.endsWith('USDT'))
            .sort((a, b) => Math.abs(parseFloat(b.priceChangePercent)) - Math.abs(parseFloat(a.priceChangePercent)))
            .slice(0, 4);
        
        state.topAssets = sorted.map(i => i.symbol.replace('USDT', 'USD') + "_otc");
        console.log("🔥 Dynamic Menu Updated:", state.topAssets);
    } catch (e) {
        state.topAssets = ["BTCUSD_otc", "ETHUSD_otc", "SOLUSD_otc", "BNBUSD_otc"];
    }
}

const getMenu = () => {
    const buttons = state.topAssets.map(asset => ({
        text: `${asset === state.selectedAsset ? '📍 ' : ''}${asset.split('_')[0]}`,
        callback_data: `scan_${asset}`
    }));

    return {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: state.isAuto ? '🛑 STOP AUTO' : '🚀 START AUTO', callback_data: 'toggle_auto' }],
                [buttons[0], buttons[1]],
                [buttons[2], buttons[3]],
                [{ text: '🔄 REFRESH VOLATILITY', callback_data: 'refresh_vol' }]
            ]
        }
    };
};

// --- COMMANDS ---

bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;
    await refreshTopAssets();
    
    const welcome = `💎 **AI VOLATILITY TERMINAL**\n\n` +
                    `Status: \`Authenticated\`\n` +
                    `Target: \`${state.selectedAsset}\`\n` +
                    `Bet: \`$${state.tradeAmount} CAD\`\n\n` +
                    `_Menu updated with today's most volatile assets._`;
    bot.sendMessage(msg.chat.id, welcome, getMenu());
});

bot.onText(/\/execute/, async (msg) => {
    if (msg.from.id !== adminId) return;
    
    bot.sendMessage(msg.chat.id, `🚀 **Executing on ${state.selectedAsset}...**`);
    // Logic for placeTrade(state.selectedAsset, ...)
});

bot.onText(/\/amount (\d+)/, (msg, match) => {
    state.tradeAmount = parseInt(match[1]);
    bot.sendMessage(msg.chat.id, `✅ Bet size: \`$${state.tradeAmount}\``);
});

bot.onText(/\/address (.+)/, (msg, match) => {
    state.payoutAddress = match[1];
    bot.sendMessage(msg.chat.id, `🎯 Wallet linked: \`${state.payoutAddress}\``);
});

// --- CALLBACK HANDLER ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    if (query.data === 'refresh_vol') {
        await refreshTopAssets();
        return bot.editMessageText(`💎 **VOLATILITY REFRESHED**\nTarget: \`${state.selectedAsset}\``, {
            chat_id: chatId, message_id: msgId, ...getMenu()
        });
    }

    if (query.data.startsWith('scan_')) {
        state.selectedAsset = query.data.split('_')[1] + "_otc";
        const result = await runAIScan(state.selectedAsset); // Your news logic
        
        const report = `🎯 **Signal: ${state.selectedAsset}**\n` +
                       `Result: \`${result.sig}\` (${result.conf})\n\n` +
                       `📍 _Selection locked. You can now use /execute repeatedly._`;
        
        bot.editMessageText(report, { chat_id: chatId, message_id: msgId, ...getMenu() });
    }
    bot.answerCallbackQuery(query.id);
});

async function runAIScan(asset) {
    return { sig: "HIGHER", conf: "89%" };
}
