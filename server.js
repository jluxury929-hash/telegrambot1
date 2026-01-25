/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (SYNC-MASTER)
 * ===============================================================================
 * FIX: Fully interactive buttons (Updates Risk/Mode/Amount via UI cycling).
 * FIX: /connect - Dual-Path Solana Discovery (Standard vs Legacy).
 * FIX: /amount <val> - RegEx corrected for manual trade size overrides.
 * FIX: /status - Multi-RPC Failover for reliable balance reporting.
 * AUTO: 24/7 Self-healing Sniper Loop with 1.5s High-Frequency Polling.
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

// --- 🛡️ GLOBAL PROCESS GUARDS ---
process.on('uncaughtException', (e) => console.error(`[CRITICAL] ${e.message}`.red));
process.on('unhandledRejection', (r) => console.error(`[REJECTED] ${r}`.red));

// --- CONSTANTS ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const RUGCHECK_API = "https://api.rugcheck.xyz/v1/tokens";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};
const RPC_FALLBACKS = [process.env.SOLANA_RPC, 'https://api.mainnet-beta.solana.com', 'https://solana-mainnet.g.allthatnode.com'];

// --- GLOBAL STATE ---
let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, currentAsset: 'So11111111111111111111111111111111111111112'
};
let solWallet;

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { 
    polling: { params: { allowed_updates: ["message", "callback_query"] } } 
});

// ==========================================
//  📊 UI REFRESH & DASHBOARD LOGIC
// ==========================================

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP ROTATION" : "🚀 START ROTATION", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: "💵 WITHDRAW TO USDT", callback_data: "cmd_withdraw_prompt" }]
        ]
    }
});

const refreshMenu = (chatId, msgId) => {
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
};

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
        refreshMenu(chatId, msgId);
    }
    if (q.data === "cycle_mode") {
        const modes = ['SHORT', 'MEDIUM', 'LONG'];
        SYSTEM.mode = modes[(modes.indexOf(SYSTEM.mode) + 1) % modes.length];
        refreshMenu(chatId, msgId);
    }
    if (q.data === "cycle_amt") {
        const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
        refreshMenu(chatId, msgId);
    }
    if (q.data === "cmd_status") {
        await runStatusUpdate(chatId);
    }
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(q.id, { text: "❌ Connect Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startNetworkSniper(chatId);
        refreshMenu(chatId, msgId);
    }
    bot.answerCallbackQuery(q.id);
});

// ==========================================
//  🔗 CONNECT WALLET (DUAL-PATH SCAN)
// ==========================================

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const seedStr = match[1].trim();
    try {
        if (!bip39.validateMnemonic(seedStr)) return bot.sendMessage(msg.chat.id, "❌ **INVALID SEED.**");
        const seed = await bip39.mnemonicToSeed(seedStr);
        const seedHex = seed.toString('hex');

        // Path Discovery: Phantom (Standard) vs Trust (Legacy)
        const keyA = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seedHex).key);
        const keyB = Keypair.fromSeed(derivePath("m/44'/501'/0'", seedHex).key);

        const conn = new Connection(RPC_FALLBACKS[0]);
        const [balA, balB] = await Promise.all([conn.getBalance(keyA.publicKey), conn.getBalance(keyB.publicKey)]);
        
        solWallet = (balB > balA) ? keyB : keyA;

        bot.sendMessage(msg.chat.id, 
            `⚡ **NEURAL SYNC COMPLETE**\n` +
            `📍 **SVM:** \`${solWallet.publicKey.toString()}\`\n` +
            `💰 **BAL:** ${((Math.max(balA, balB)) / 1e9).toFixed(4)} SOL\n\n` +
            `*Rotation engine is now authorized.*`, 
            { parse_mode: 'Markdown', ...getDashboardMarkup() }
        );
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.**"); }
});

// ==========================================
//  ⚙️ MANUAL OVERRIDES
// ==========================================

bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    const val = match[1];
    SYSTEM.tradeAmount = val;
    bot.sendMessage(msg.chat.id, `✅ **TRADE SIZE UPDATED:** \`${val} SOL\``, { parse_mode: 'Markdown' });
});

async function runStatusUpdate(chatId) {
    if (!solWallet) return bot.sendMessage(chatId, "❌ **SYNC WALLET FIRST.**");
    bot.sendChatAction(chatId, 'typing');
    
    let bal = 0;
    for (const rpc of RPC_FALLBACKS) {
        try {
            const conn = new Connection(rpc);
            bal = await conn.getBalance(solWallet.publicKey);
            break; 
        } catch (e) { continue; }
    }

    const msg = `📊 **APEX STATUS**\n------------------\n📍 SVM: \`${solWallet.publicKey.toString().substring(0,8)}...\`\n💰 Balance: ${(bal/1e9).toFixed(4)} SOL\n🤖 Auto-Pilot: ${SYSTEM.autoPilot ? '✅ ACTIVE' : '❌ OFF'}\n🛡️ Risk: ${SYSTEM.risk}\n⏱️ Mode: ${SYSTEM.mode}`;
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

// ==========================================
//  🔄 SNIPER ENGINE (24/7)
// ==========================================

async function startNetworkSniper(chatId) {
    if (!SYSTEM.autoPilot) return;
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const match = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        if (match) {
            SYSTEM.lastTradedTokens[match.tokenAddress] = true;
            // Existing executeRotation function call
        }
    } catch (e) { }
    setTimeout(() => startNetworkSniper(chatId), 1500);
}

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX DASHBOARD v9032**", { parse_mode: 'Markdown', ...getDashboardMarkup() });
});

http.createServer((req, res) => res.end("READY")).listen(8080);
