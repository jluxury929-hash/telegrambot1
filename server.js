/**
 * ===============================================================================
 * 🤖 APEX PREDATOR TRADING BOT (Telegram Edition)
 * ===============================================================================
 * A fully interactive AI-driven trading companion.
 * * COMMANDS:
 * /start       - Open the main menu
 * /status      - Check bot settings and wallet balance
 * /setamount   - Set how much ETH to trade (e.g., /setamount 0.1)
 * /auto        - Toggle Auto-Trading ON/OFF
 * /scan        - Force a manual AI market scan
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');
require('colors');

// ==========================================
// 0. CONFIGURATION
// ==========================================
const TELEGRAM_TOKEN = "7903779688:AAGFMT3fWaYgc9vKBhxNQRIdB5AhmX0U9Nw"; // Your Token
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;

// SAFETY CHECK
if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
    console.error("❌ ERROR: Missing or Invalid PRIVATE_KEY in .env".red);
    process.exit(1);
}

// NETWORK CONFIG (Defaults to Ethereum, easy to switch)
const RPC_URL = process.env.ETH_RPC || "https://eth.llamarpc.com";
const CHAIN_ID = 1;

// AI SOURCES
const AI_SITES = [
    "https://api.crypto-ai-signals.com/v1/latest", 
    "https://top-trading-ai-blog.com/alerts"
];

// USER SETTINGS (Mutable via Telegram)
const USER_CONFIG = {
    tradeAmount: "0.01", // Default ETH amount
    autoTrade: false,    // Default to Manual (safer)
    slippage: 3          // 3% slippage tolerance
};

// ==========================================
// 1. INITIALIZATION
// ==========================================
console.clear();
console.log(`╔════════════════════════════════╗`.green);
console.log(`║ 🤖 APEX TELEGRAM TRADER v2.0   ║`.green);
console.log(`╚════════════════════════════════╝`.green);

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new Wallet(PRIVATE_KEY, provider);
const sentiment = new Sentiment();

// Contract Interface (The Executor)
let executorContract = null;
if (ethers.isAddress(EXECUTOR_ADDRESS)) {
    executorContract = new Contract(EXECUTOR_ADDRESS, [
        "function executeComplexPath(string[] path,uint256 amount) external payable"
    ], wallet);
}

// Health Server (Keeps container alive)
http.createServer((req, res) => {
    res.writeHead(200);
    res.end(JSON.stringify({ status: "Online", config: USER_CONFIG }));
}).listen(8080, () => console.log("[SYSTEM] Health Monitor: OK (Port 8080)".cyan));


// ==========================================
// 2. TELEGRAM COMMAND HANDLERS
// ==========================================

// --- START MENU ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const message = `
🦁 **APEX PREDATOR ONLINE**

I am ready to trade. 
Current Strategy: **${USER_CONFIG.autoTrade ? "⚡ AUTOMATIC" : "🛡️ MANUAL CONFIRMATION"}**
Trade Size: **${USER_CONFIG.tradeAmount} ETH**

**Commands:**
/scan - Find trades now
/auto - Toggle Auto-Trade
/setamount <val> - Change trade size
/status - View Wallet & Config
    `;
    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// --- SET AMOUNT ---
bot.onText(/\/setamount (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const amount = parseFloat(match[1]);
    if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, "❌ Invalid amount. Try: `/setamount 0.1`");
    }
    USER_CONFIG.tradeAmount = amount.toString();
    bot.sendMessage(chatId, `✅ Trade size updated to: **${USER_CONFIG.tradeAmount} ETH**`, { parse_mode: "Markdown" });
});

// --- TOGGLE AUTO ---
bot.onText(/\/auto/, (msg) => {
    const chatId = msg.chat.id;
    USER_CONFIG.autoTrade = !USER_CONFIG.autoTrade;
    const status = USER_CONFIG.autoTrade ? "⚡ ON (Dangerous)" : "🛡️ OFF (Safe)";
    bot.sendMessage(chatId, `🔄 Auto-Trading is now: **${status}**`, { parse_mode: "Markdown" });
});

// --- STATUS CHECK ---
bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    const balance = await provider.getBalance(wallet.address);
    const ethBal = ethers.formatEther(balance);
    
    const message = `
📊 **SYSTEM STATUS**
-------------------
💰 **Wallet:** ${ethBal.substring(0, 6)} ETH
⚙️ **Mode:** ${USER_CONFIG.autoTrade ? "Auto" : "Manual"}
ea **Size:** ${USER_CONFIG.tradeAmount} ETH
🔗 **Network:** Ethereum Mainnet
    `;
    bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
});

// --- MANUAL SCAN ---
bot.onText(/\/scan/, async (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Scanning markets with AI...");
    await runAIScan();
});

// --- BUTTON CLICKS (For Manual Trades) ---
bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data; // Format: "BUY_TOKEN"

    if (data.startsWith("BUY_")) {
        const token = data.split("_")[1];
        bot.answerCallbackQuery(callbackQuery.id, { text: `Buying ${token}...` });
        await executeTrade(token, "Manual Click");
    }
});


// ==========================================
// 3. AI & TRADING LOGIC
// ==========================================

async function runAIScan() {
    console.log("[AI] Scanning for signals...".yellow);
    
    // Simulate fetching signals (replace with real API logic if desired)
    // We scan the URLs configured in AI_SITES
    let foundSignal = false;

    for (const url of AI_SITES) {
        try {
            const res = await axios.get(url, { timeout: 4000 });
            const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            
            // Analyze Sentiment
            const result = sentiment.analyze(text);
            const tickers = text.match(/\$[A-Z]{2,5}/g); // Find $ETH, $BTC etc.

            if (tickers && result.score > 0) {
                const token = tickers[0].replace('$', '');
                const confidence = result.comparative;
                const keywords = result.words.join(", ") || "General sentiment";
                
                // FOUND A SIGNAL
                foundSignal = true;
                handleSignal(token, confidence, keywords);
                break; // Stop after one signal to avoid spam
            }
        } catch (e) {
            // Ignore fetch errors
        }
    }

    if (!foundSignal) {
        // If no signal found in scan, sometimes we simulate one for "Testing" if requested
        // Uncomment below to force a test signal every scan:
        // handleSignal("LINK", 0.8, "partnership, growth, bullish");
    }
}

async function handleSignal(token, confidence, reason) {
    const chatId = TELEGRAM_CHAT_ID || (await bot.getUpdates())[0]?.message?.chat?.id;
    if (!chatId) return console.log("[AI] Signal found but no Chat ID known yet.".red);

    const emoji = confidence > 0.5 ? "🚀" : "📈";
    const amount = USER_CONFIG.tradeAmount;

    // 1. GENERATE EXPLANATION
    const explanation = `
${emoji} **AI SIGNAL DETECTED: ${token}**
---------------------------
🧠 **Confidence:** ${(confidence * 100).toFixed(0)}%
📝 **Why:** Detected positive keywords: _"${reason}"_
💰 **Action:** Buy ${amount} ETH worth of ${token}
    `;

    // 2. CHECK AUTO MODE
    if (USER_CONFIG.autoTrade) {
        bot.sendMessage(chatId, `${explanation}\n\n⚙️ **Auto-Executing...**`, { parse_mode: "Markdown" });
        await executeTrade(token, "AI Auto-Trade");
    } else {
        // 3. MANUAL MODE - ASK USER
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `✅ BUY ${token} NOW`, callback_data: `BUY_${token}` }]
                ]
            },
            parse_mode: "Markdown"
        };
        bot.sendMessage(chatId, explanation, opts);
    }
}

async function executeTrade(token, source) {
    const chatId = TELEGRAM_CHAT_ID;
    
    try {
        if (!executorContract) throw new Error("Executor Contract not configured.");

        console.log(`[TRADE] Executing buy for ${token}...`.magenta);
        
        // Setup Transaction
        const amountWei = ethers.parseEther(USER_CONFIG.tradeAmount.toString());
        const path = ["ETH", token]; // Simple path
        
        // Execute on Blockchain
        const tx = await executorContract.executeComplexPath(path, amountWei, {
            value: amountWei, // Sending ETH
            gasLimit: 500000  // Limit gas
        });

        bot.sendMessage(chatId, `✅ **ORDER SENT!**\n\nTx Hash: \`${tx.hash}\`\nSource: ${source}`, { parse_mode: "Markdown" });
        console.log(`[TRADE] Sent: ${tx.hash}`.green);
        
        await tx.wait();
        bot.sendMessage(chatId, `🎉 **CONFIRMED:** Trade successful for ${token}!`);

    } catch (e) {
        console.error(`[TRADE ERROR] ${e.message}`.red);
        if (chatId) bot.sendMessage(chatId, `❌ **TRADE FAILED**\n\nReason: ${e.message}`);
    }
}

// ==========================================
// 4. MAIN LOOP
// ==========================================
// Scan every 30 seconds to avoid API bans
setInterval(runAIScan, 30000);

console.log("[SYSTEM] Apex Predator Bot is Running...".cyan);
