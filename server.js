/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (ULTIMATE 24/7 FIXED)
 * ===============================================================================
 * FIX: Self-Correction Loop for Polling Conflicts.
 * FIX: Dashboard Sync - Buttons now refresh state correctly.
 * ADD: /connect <seed> - HD Wallet Mapping.
 * ADD: /withdraw <fraction> - SPL -> USDT Engine.
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

// --- GLOBAL STATE ---
let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, currentAsset: 'So11111111111111111111111111111111111111112'
};
let solWallet, evmWallet;

// --- BOT INITIALIZATION ---
// Added error handling to verify token connection
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

bot.getMe().then((me) => {
    console.log(`✅ APEX v9032 ONLINE: Authorized as @${me.username}`.green);
}).catch((err) => {
    console.error(`❌ CONNECTION ERROR: Check your TELEGRAM_TOKEN in .env`.red);
});

// ==========================================
//  📊 DASHBOARD & UI REFRESH
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

const refreshUI = (chatId, msgId) => {
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
};

// ==========================================
//  🕹️ COMMAND HANDLERS
// ==========================================

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
        refreshUI(chatId, msgId);
    }
    if (q.data === "cycle_mode") {
        const modes = ['SHORT', 'MEDIUM', 'LONG'];
        SYSTEM.mode = modes[(modes.indexOf(SYSTEM.mode) + 1) % modes.length];
        refreshUI(chatId, msgId);
    }
    if (q.data === "cycle_amt") {
        const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
        refreshUI(chatId, msgId);
    }
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(q.id, { text: "❌ Connect Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startNetworkSniper(chatId);
        refreshUI(chatId, msgId);
    }
    if (q.data === "cmd_status") {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
        const bal = solWallet ? await conn.getBalance(solWallet.publicKey) : 0;
        bot.sendMessage(chatId, `📊 **STATUS REPORT**\n------------------\n📍 **SVM:** \`${solWallet?.publicKey.toString().substring(0,8)}...\`\n💰 **BAL:** ${(bal/1e9).toFixed(4)} SOL\n🤖 **AUTO:** ${SYSTEM.autoPilot ? 'ACTIVE' : 'OFF'}`);
    }
    if (q.data === "cmd_withdraw_prompt") {
        bot.sendMessage(chatId, "💵 Use command: `/withdraw 1` (100%) or `/withdraw 0.5` (50%)");
    }
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/withdraw (.+)/, async (msg, match) => {
    const fraction = parseFloat(match[1]);
    if (!solWallet || isNaN(fraction)) return bot.sendMessage(msg.chat.id, "❌ Example: `/withdraw 1` for 100%");
    
    bot.sendMessage(msg.chat.id, `🏦 **WITHDRAWAL:** Converting ${fraction * 100}% to USDT...`);
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const accounts = await conn.getParsedTokenAccountsByOwner(solWallet.publicKey, { programId: TOKEN_PROGRAM_ID });
        
        for (const account of accounts.value) {
            const info = account.account.data.parsed.info;
            const withdrawRaw = Math.floor(info.tokenAmount.amount * Math.min(fraction, 1));
            if (withdrawRaw > 0 && info.mint !== USDT_MINT) {
                const quote = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${info.mint}&outputMint=${USDT_MINT}&amount=${withdrawRaw}&slippageBps=100`);
                const swap = await axios.post(`${JUP_ULTRA_API}/swap`, { quoteResponse: quote.data, userPublicKey: solWallet.publicKey.toString() });
                const tx = VersionedTransaction.deserialize(Buffer.from(swap.data.swapTransaction, 'base64'));
                tx.sign([solWallet]);
                await conn.sendRawTransaction(tx.serialize());
            }
        }
        bot.sendMessage(msg.chat.id, "✅ **WITHDRAWAL COMPLETE.**");
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **WITHDRAWAL ERROR.**"); }
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        evmWallet = ethers.Wallet.fromPhrase(raw);
        bot.sendMessage(msg.chat.id, `⚡ **NEURAL SYNC COMPLETE**\n📍 SVM: \`${solWallet.publicKey.toString()}\``);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.** Check seed phrase."); }
});

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX DASHBOARD v9032**", { parse_mode: 'Markdown', ...getDashboardMarkup() });
});

// ==========================================
//  🔄 INFINITE SNIPER (SELF-HEALING)
// ==========================================

async function startNetworkSniper(chatId) {
    if (!SYSTEM.autoPilot) return;
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const match = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        if (match) {
            SYSTEM.lastTradedTokens[match.tokenAddress] = true;
            await executeRotation(chatId, match.tokenAddress, match.symbol);
        }
    } catch (e) { await new Promise(r => setTimeout(r, 3000)); }
    setTimeout(() => startNetworkSniper(chatId), 1500);
}

async function executeRotation(chatId, targetToken, symbol) {
    try {
        const audit = await axios.get(`${RUGCHECK_API}/${targetToken}/report`);
        if (audit.data.score > 400) return;

        bot.sendMessage(chatId, `🧠 **NEURAL ROTATION:** Moving capital to $${symbol}...`);
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        const res = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=100`);
        const swapRes = await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: res.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        
        bot.sendMessage(chatId, `🚀 **SUCCESS:** Rotated into $${symbol}\n🔗 [View Solscan](https://solscan.io/tx/${sig})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        SYSTEM.currentAsset = targetToken;
    } catch (e) { console.error(e); }
}

http.createServer((req, res) => res.end("APEX READY")).listen(8080);
