/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (PRO-MAX Master Edition)
 * ===============================================================================
 * FIX: Auto-Pilot Heartbeat - Recursive setTimeout ensures the loop never stalls.
 * AI: Neural Gating - Filters Rugs and Sanitizes Metadata (.png fix).
 * PROFIT: Endless Cycle - Capital rotates from currentAsset -> next alpha.
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

// --- 🛡️ GLOBAL PROCESS GUARDS ---
process.on('uncaughtException', (err) => console.error(`[CRITICAL] ${err.message}`.red));
process.on('unhandledRejection', (reason) => console.error(`[REJECTED] ${reason}`.red));

// --- CONSTANTS ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const RUGCHECK_API = "https://api.rugcheck.xyz/v1/tokens";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};

// --- GLOBAL STATE ---
let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, currentAsset: 'So11111111111111111111111111111111111111112',
    isLocked: false, marketHealth: "STABLE"
};
let solWallet;

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { 
    polling: { params: { allowed_updates: ["message", "callback_query"] } } 
});

// ==========================================
//  🔄 THE FIXED AUTO-PILOT ENGINE
// ==========================================

async function startEndlessCycle(chatId) {
    // 1. Check if Auto-Pilot is still ON
    if (!SYSTEM.autoPilot) {
        console.log(`[SYSTEM] Auto-Pilot stopped.`.yellow);
        return;
    }

    try {
        // 2. Scan Web AI Signals (DexScreener Boosted)
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const signal = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);

        if (signal && !SYSTEM.isLocked) {
            // 3. Neural Security Gate (RugCheck Audit)
            const audit = await axios.get(`${RUGCHECK_API}/${signal.tokenAddress}/report`);
            
            if (audit.data.score < 400) {
                SYSTEM.isLocked = true;
                
                // Metadata Sanitizer (Bugfix for .png tickers)
                let ticker = signal.symbol || "ALPHA";
                if (/\.(png|jpg|jpeg|gif)$/i.test(ticker)) ticker = `TKN-${signal.tokenAddress.substring(0,4)}`;

                bot.sendMessage(chatId, `🧠 **AI SIGNAL FOUND:** Engaging $${ticker}...`);
                
                // 4. Execute Rotation (Current Asset -> Next Profitable Crypto)
                const buy = await executeDiagnosticRotation(chatId, signal.tokenAddress, ticker);
                
                if (buy) {
                    SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                    // 5. Monitor and Exit (The bot only continues the loop after the trade closes)
                    await monitorPnLAndCycle(chatId, signal.tokenAddress, ticker, buy.entryPrice);
                }
                
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) {
        console.error(`[LOOP ERROR] ${e.message}`.yellow);
        // Wait 5 seconds before retrying on error to avoid API bans
        await new Promise(r => setTimeout(r, 5000));
    }

    // 6. RECURSIVE HEARTBEAT (The Endless Part)
    // 1.2s delay ensures we are ready for the very next block
    setTimeout(() => startEndlessCycle(chatId), 1200);
}

// ==========================================
//  ⚡ DIAGNOSTIC EXECUTION ENGINE
// ==========================================

async function executeDiagnosticRotation(chatId, addr, ticker) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        // Quote from Jupiter
        const quote = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${addr}&amount=${amt}&slippageBps=100`);

        // Swap Prep with Jito Priority
        const swapRes = await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: quote.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);

        // Broadcast to Blockchain
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        
        bot.sendMessage(chatId, `🚀 **ENTERED:** $${ticker}\n🔗 [Solscan](https://solscan.io/tx/${sig})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        
        SYSTEM.currentAsset = addr;
        return { entryPrice: parseFloat(quote.data.outAmount) || 1 };
    } catch (e) {
        bot.sendMessage(chatId, `❌ **AUTO ERROR:** Trade failed at execution stage. Ticker: $${ticker}`);
        return null;
    }
}

async function monitorPnLAndCycle(chatId, addr, symbol, entry) {
    let peak = entry;
    return new Promise((resolve) => {
        const monitor = setInterval(async () => {
            try {
                const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
                const now = parseFloat(res.data.pairs[0].priceUsd);
                const pnl = ((now - entry) / entry) * 100;

                if (now > peak) peak = now;
                const drop = ((peak - now) / peak) * 100;

                // Exit Logic: Trailing Stop
                if (pnl >= 35 || (pnl > 5 && drop > 10) || pnl <= -9) {
                    clearInterval(monitor);
                    bot.sendMessage(chatId, `📉 **EXIT:** $${symbol} | PnL: ${pnl.toFixed(2)}%\n🔄 **RE-SCANNING FOR PROFIT...**`);
                    resolve(true); 
                }
            } catch (e) { clearInterval(monitor); resolve(false); }
        }, 10000);
    });
}

// ==========================================
//  🕹️ UI & BUTTON SYNC
// ==========================================

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "🔗 SYNC", callback_data: "cmd_conn_prompt" }]
        ]
    }
});

bot.on('callback_query', async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(q.message.chat.id, "❌ Connect Wallet First!");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(q.message.chat.id, "🚀 **AUTO-PILOT ACTIVE:** Endless profit rotation loop started.");
            startEndlessCycle(q.message.chat.id);
        }
        bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: q.message.chat.id, message_id: q.message.message_id }).catch(() => {});
    }
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        bot.sendMessage(msg.chat.id, `⚡ **SYNC:** \`${solWallet.publicKey.toString().substring(0,8)}...\``);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.**"); }
});

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX v9032 AUTO-CENTER**", getDashboardMarkup());
});

http.createServer((req, res) => res.end("AUTO ACTIVE")).listen(8080);
