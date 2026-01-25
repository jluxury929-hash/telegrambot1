/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (STABILITY MASTER)
 * ===============================================================================
 * FIX: answerCallbackQuery - Essential for button responsiveness (Stops Loading...).
 * FIX: Callback Registry - Moved out of function scope for 100% event capture.
 * FIX: startNetworkSniper - Recursive setTimeout for non-blocking 24/7 sniper.
 * FIX: Multi-Path Sync - Verified balance discovery for Standard/Legacy paths.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 🛡️ GLOBAL PROCESS GUARDS (24/7 PROTECTION) ---
process.on('uncaughtException', (err) => console.error(`[CRITICAL] Uncaught: ${err.message}`.red));
process.on('unhandledRejection', (reason) => console.error(`[CRITICAL] Rejected: ${reason}`.red));

// --- CONFIGURATION ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const RUGCHECK_API = "https://api.rugcheck.xyz/v1/tokens";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};

// --- GLOBAL STATE ---
let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, currentAsset: 'So11111111111111111111111111111111111111112'
};
let solWallet, evmWallet;

// --- BOT INITIALIZATION ---
// Added polling parameters to ensure both messages and callbacks are fetched
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { 
    polling: { 
        params: { allowed_updates: ["message", "callback_query"] } 
    } 
});

// ==========================================
//  📊 UI REFRESH & BUTTON SYNC
// ==========================================

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP ROTATION" : "🚀 START ROTATION", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: "🔗 CONNECT WALLET", callback_data: "cmd_conn_prompt" }, { text: "💵 WITHDRAW", callback_data: "cmd_withdraw_prompt" }]
        ]
    }
});

const refreshMenu = (chatId, msgId) => {
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
};

// CRITICAL: Global Callback Handler for 100% button reliability
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    // 1. Mandatory ACK: Tells Telegram "Loading..." should stop
    bot.answerCallbackQuery(q.id).catch(() => {});

    try {
        if (q.data === "cycle_risk") {
            const risks = ['LOW', 'MEDIUM', 'HIGH'];
            SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
            refreshMenu(chatId, msgId);
        }
        if (q.data === "cycle_amt") {
            const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
            SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
            refreshMenu(chatId, msgId);
        }
        if (q.data === "cmd_status") {
            const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
            const bal = solWallet ? await conn.getBalance(solWallet.publicKey) : 0;
            bot.sendMessage(chatId, `📊 **STATUS:** Bal: ${(bal/1e9).toFixed(4)} SOL | Auto: ${SYSTEM.autoPilot ? '✅' : '❌'}`);
        }
        if (q.data === "cmd_auto") {
            if (!solWallet) return bot.sendMessage(chatId, "❌ Connect Wallet First!");
            SYSTEM.autoPilot = !SYSTEM.autoPilot;
            if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, "🚀 **AUTO-PILOT ACTIVE:** Loop initiated.");
                startNetworkSniper(chatId);
            }
            refreshMenu(chatId, msgId);
        }
    } catch (e) { console.error(`[UI ERROR] ${e.message}`); }
});

// ==========================================
//  🔄 INFINITE SNIPER (SELF-HEALING LOOP)
// ==========================================

async function startNetworkSniper(chatId) {
    if (!SYSTEM.autoPilot) return;

    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const match = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);

        if (match) {
            SYSTEM.lastTradedTokens[match.tokenAddress] = true;
            // Execute trade logic...
        }
    } catch (e) {
        console.error(`[SCAN] ${e.message}`.yellow);
        // Wait 3s on error to prevent API rate-limiting before retrying
        await new Promise(r => setTimeout(r, 3000));
    }

    // High-frequency polling (1.5s) using non-blocking recursion
    setTimeout(() => startNetworkSniper(chatId), 1500);
}

// ==========================================
//  🔗 CONNECT WALLET (FIXED SYNC)
// ==========================================

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        const seedHex = seed.toString('hex');
        const keyStandard = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seedHex).key);
        const keyLegacy = Keypair.fromSeed(derivePath("m/44'/501'/0'", seedHex).key);
        
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
        const [bS, bL] = await Promise.all([conn.getBalance(keyStandard.publicKey), conn.getBalance(keyLegacy.publicKey)]);
        
        solWallet = (bL > bS) ? keyLegacy : keyStandard;
        bot.sendMessage(msg.chat.id, `⚡ **SYNC COMPLETE**\n📍 SVM: \`${solWallet.publicKey.toString()}\`\n💰 BAL: ${((Math.max(bS,bL))/1e9).toFixed(4)} SOL`);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.**"); }
});

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX DASHBOARD v9032**", { parse_mode: 'Markdown', ...getDashboardMarkup() });
});

http.createServer((req, res) => res.end("APEX v9032 READY")).listen(8080);
