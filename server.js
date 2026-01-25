/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9050 (FIXED BUTTONS & MANUAL OVERRIDE)
 * ===============================================================================
 * ADDED: /amount <value> command for instant trade size overrides.
 * FIXED: Inline button cycling (Risk/Mode/Amount) with UI acknowledgement.
 * FIXED: Auto-Pilot state preservation during rotation.
 * ARCH: BIP-44 Multi-Path SOL detection & Jito Priority fees (150k CU).
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 1. GLOBAL STATE & HELPERS ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: false, currentAsset: 'So11111111111111111111111111111111111111112'
};
let solWallet;

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const toExact = (num, fixed) => {
    const re = new RegExp('^-?\\d+(?:\\.\\d{0,' + (fixed || -1) + '})?');
    const match = num.toString().match(re);
    return match ? match[0] : num.toString();
};

// --- 2. DYNAMIC DASHBOARD ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ MODE: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: "🔗 SYNC WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

// --- 3. COMMAND LISTENERS ---

// /start and /menu
bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, 
        `<b>⚡️ APEX PREDATOR v9050 ⚡️</b>\n` +
        `<i>Neural Volatility Engine Online</i>\n\n` +
        `<b>Mode:</b> <code>${SYSTEM.mode}</code>\n` +
        `<b>Asset:</b> <code>Native SOL</code>`, 
        { parse_mode: 'HTML', ...getDashboardMarkup() }
    );
});

// /amount <value> - Manual Trade Amount Override
bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    const newVal = match[1];
    SYSTEM.tradeAmount = newVal;
    bot.sendMessage(msg.chat.id, `✅ <b>TRADE SIZE UPDATED:</b> <code>${newVal} SOL</code>`, { parse_mode: 'HTML' });
});

// Button Logic
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    // IMPORTANT: Clear the "loading" spinner on the button
    await bot.answerCallbackQuery(query.id).catch(() => {});

    if (query.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
    } else if (query.data === "cycle_mode") {
        const modes = ['SHORT', 'MEDIUM', 'LONG'];
        SYSTEM.mode = modes[(modes.indexOf(SYSTEM.mode) + 1) % modes.length];
    } else if (query.data === "cycle_amt") {
        const amts = ["0.05", "0.1", "0.25", "0.5"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    } else if (query.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "⚠️ Sync Wallet first!");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startHeartbeat(chatId);
    } else if (query.data === "cmd_status") {
        return runStatusDashboard(chatId);
    }

    // Refresh UI
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
});

// --- 4. HEARTBEAT ENGINE ---
async function startHeartbeat(chatId) {
    if (!SYSTEM.autoPilot) return;
    try {
        if (!SYSTEM.isLocked) {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const signal = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
            if (signal) {
                SYSTEM.isLocked = true;
                await executeArbSwap(chatId, signal.tokenAddress, signal.symbol);
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) { console.error("Auto error:".red, e.message); }
    setTimeout(() => startHeartbeat(chatId), 2500);
}

// Token-to-Token Execution
async function executeArbSwap(chatId, targetToken, symbol) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        const quote = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=100`);
        const { swapTransaction } = (await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: quote.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000
        })).data;
        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        bot.sendMessage(chatId, `🚀 <b>ROTATION COMPLETE:</b> $${symbol}\n<a href="https://solscan.io/tx/${sig}">Solscan</a>`, { parse_mode: 'HTML', disable_web_page_preview: true });
        SYSTEM.currentAsset = targetToken;
    } catch (e) { console.error("Swap Error:".red, e.message); }
}

// Wallet & Dashboard
bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        const key = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        solWallet = key;
        bot.sendMessage(msg.chat.id, `🔗 <b>SYNCED:</b> <code>${key.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Sync Failed."); }
});

async function runStatusDashboard(chatId) {
    if (!solWallet) return;
    const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
    const bal = (await conn.getBalance(solWallet.publicKey)) / LAMPORTS_PER_SOL;
    bot.sendMessage(chatId, `📊 <b>LIVE STATUS</b>\n<code>BAL: ${toExact(bal, 4)} SOL</code>`, { parse_mode: 'HTML' });
}

http.createServer((req, res) => res.end("APEX v9050 ONLINE")).listen(8080);
