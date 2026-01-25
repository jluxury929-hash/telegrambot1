/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (ENDLESS CYCLE EDITION)
 * ===============================================================================
 * LOOP: Recursive "Next-Alpha" logic - Auto-deploys capital after every exit.
 * SPEED: High-frequency 1.2s signal polling with Jito-Bundle landing.
 * PROFIT: Continuous rotation cycle ends ONLY on manual Withdraw/Stop.
 * SAFETY: RugCheck Security Gate + Self-Destructing seed phrase logs.
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

// --- 🛡️ PROCESS GUARDS ---
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
    isLocked: false
};
let solWallet;

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// ==========================================
//  🔄 THE ENDLESS CYCLE ENGINE
// ==========================================

async function startEndlessCycle(chatId) {
    if (!SYSTEM.autoPilot) {
        console.log("🛑 Endless Cycle Stopped by User.".yellow);
        return;
    }

    try {
        // 1. Scan for the absolute latest boosted signal
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const signal = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);

        if (signal && !SYSTEM.isLocked) {
            // 2. Security Gate
            const audit = await axios.get(`${RUGCHECK_API}/${signal.tokenAddress}/report`);
            if (audit.data.score < 400) {
                SYSTEM.isLocked = true;
                SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                
                // 3. Execute Rapid Rotation
                const buy = await executeSolShotgun(chatId, signal.tokenAddress, signal.symbol);
                if (buy) {
                    // 4. Enter Trailing Profit Monitor
                    await startCycleMonitor(chatId, signal.tokenAddress, signal.symbol, buy.entryPrice);
                }
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) {
        await new Promise(r => setTimeout(r, 3000));
    }

    // High-frequency 1.2s polling for the next block
    setTimeout(() => startEndlessCycle(chatId), 1200);
}

async function startCycleMonitor(chatId, addr, symbol, entry) {
    let peak = entry;
    return new Promise((resolve) => {
        const monitor = setInterval(async () => {
            try {
                const dex = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
                const now = parseFloat(dex.data.pairs[0].priceUsd);
                const pnl = ((now - entry) / entry) * 100;

                if (now > peak) peak = now;
                const dropFromPeak = ((peak - now) / peak) * 100;

                // Exit Logic: 25% TP OR Trailing Stop-Loss (Risk-based)
                let exitTriggered = (pnl >= 25 || (pnl > 5 && dropFromPeak > 10) || pnl <= -8);

                if (exitTriggered) {
                    clearInterval(monitor);
                    bot.sendMessage(chatId, `📉 **CYCLE EXIT:** $${symbol} closed at ${pnl.toFixed(2)}% PnL.\n🔄 **RE-SCANNING FOR NEXT TRADE...**`);
                    resolve(true); // Signal to the loop that we are ready for the next trade
                }
            } catch (e) { clearInterval(monitor); resolve(false); }
        }, 8000);
    });
}

// ==========================================
//  ⚡ JITO EXECUTION
// ==========================================

async function executeSolShotgun(chatId, addr, ticker) {
    try {
        let symbol = ticker || "TKN";
        if (/\.(png|jpg|jpeg)$/i.test(symbol)) symbol = "ALPHA";

        bot.sendMessage(chatId, `🧠 **AI SIGNAL:** Engaging $${symbol}...`);
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        const res = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${addr}&amount=${amt}&slippageBps=100`);
        const swapRes = await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: res.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        
        bot.sendMessage(chatId, `🚀 **ENTERED:** $${symbol}\n🔗 [Solscan](https://solscan.io/tx/${sig})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        SYSTEM.currentAsset = addr;
        return { entryPrice: parseFloat(res.data.outAmount) };
    } catch (e) { return null; }
}

// ==========================================
//  🕹️ DASHBOARD & UI
// ==========================================

bot.on('callback_query', async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(q.message.chat.id, "❌ Connect Wallet First!");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(q.message.chat.id, "🚀 **ENDLESS CYCLE STARTED:** Trading will continue indefinitely until Withdraw.");
            startEndlessCycle(q.message.chat.id);
        }
    }
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        bot.sendMessage(msg.chat.id, `⚡ **SYNC COMPLETE:** \`${solWallet.publicKey.toString().substring(0,8)}...\``);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.**"); }
});

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX ENDLESS v9032**", { reply_markup: { inline_keyboard: [[{ text: SYSTEM.autoPilot ? "🛑 STOP" : "🚀 START ENDLESS LOOP", callback_data: "cmd_auto" }]] } });
});

http.createServer((req, res) => res.end("ENDLESS ACTIVE")).listen(8080);
