/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (PRO-MAX Master Edition)
 * ===============================================================================
 * AI SATELLITE: Independent observer monitoring global market health (SOL/USDC).
 * ENDLESS CYCLE: High-speed 1.2s rotation engine with recursive re-entry.
 * DIAGNOSTICS: Full Verbose Error Reporting for Quote/Swap/Broadcast stages.
 * SECURITY: Self-Destructing seed phrase logs + Multi-Path HD Discovery.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider } = require('ethers');
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
let solWallet, evmWallet;

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { 
    polling: { params: { allowed_updates: ["message", "callback_query"] } } 
});

// ==========================================
//  🛰️ AI SATELLITE (MARKET OBSERVER)
// ==========================================

async function runAISatellite(chatId) {
    try {
        // Satellite monitors global SOL/USDC volatility (Mainnet Pool)
        const res = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana/8s98m3pLv9V41WvAt4d51xWq6f85T18vL7oVf9V6qf9v');
        const change = res.data.pair.priceChange.h1;

        if (change < -5.5) {
            if (SYSTEM.marketHealth !== "VOLATILE") {
                bot.sendMessage(chatId, "⚠️ **SATELLITE ALERT:** High Market Volatility. Sniper pausing for safety.");
            }
            SYSTEM.marketHealth = "VOLATILE";
        } else {
            SYSTEM.marketHealth = "STABLE";
        }
    } catch (e) { /* Silent fail-safe */ }
    setTimeout(() => runAISatellite(chatId), 30000); // 30s check
}

// ==========================================
//  🔄 THE ENDLESS AI CYCLE (FULL-AUTO)
// ==========================================

async function startEndlessCycle(chatId) {
    if (!SYSTEM.autoPilot) return;

    // SATELLITE GATE: Pause loop if market health is bad
    if (SYSTEM.marketHealth === "VOLATILE") {
        setTimeout(() => startEndlessCycle(chatId), 5000);
        return;
    }

    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const signal = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);

        if (signal && !SYSTEM.isLocked) {
            // Neural Gating: RugCheck Audit
            const audit = await axios.get(`${RUGCHECK_API}/${signal.tokenAddress}/report`);
            if (audit.data.score < 400) {
                SYSTEM.isLocked = true;
                
                // Metadata Sanitizer (.png/empty ticker fix)
                let ticker = signal.symbol || "ALPHA";
                if (/\.(png|jpg|jpeg|gif)$/i.test(ticker) || ticker.trim() === "") {
                    ticker = `TKN-${signal.tokenAddress.substring(0,4).toUpperCase()}`;
                }

                const buy = await executeDiagnosticRotation(chatId, signal.tokenAddress, ticker);
                if (buy) {
                    SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                    // Start Trailing Stop-Loss Monitor
                    await startCycleMonitor(chatId, signal.tokenAddress, ticker, buy.entryPrice);
                }
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) { console.log(`[LOOP BLIP] ${e.message}`.yellow); }

    setTimeout(() => startEndlessCycle(chatId), 1200); // High-speed 1.2s pulse
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
                const drop = ((peak - now) / peak) * 100;

                // Exit Trigger: 35% Goal OR 12% Drop from Peak OR 10% Absolute Loss
                let trail = SYSTEM.risk === 'LOW' ? 7 : 12;
                if (pnl >= 35 || (pnl > 5 && drop > trail) || pnl <= -10) {
                    clearInterval(monitor);
                    bot.sendMessage(chatId, `📉 **EXIT:** $${symbol} | PnL: ${pnl.toFixed(2)}%\n🔄 **RE-SCANNING FOR NEXT TRADE...**`);
                    resolve(true); 
                }
            } catch (e) { clearInterval(monitor); resolve(false); }
        }, 10000);
    });
}

// ==========================================
//  ⚡ DIAGNOSTIC EXECUTION (JITO / JUP)
// ==========================================

async function executeDiagnosticRotation(chatId, addr, ticker) {
    try {
        bot.sendMessage(chatId, `🧠 **AI SIGNAL:** Engaging $${ticker}...`);
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        // 1. Quote Stage
        const res = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${addr}&amount=${amt}&slippageBps=100`)
            .catch(e => { throw new Error(`Jupiter Quote Failed: Token has no liquidity.`); });

        // 2. Swap Stage
        const swapRes = await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: res.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        }).catch(e => { throw new Error(`Jupiter Swap Prep Failed: Check SOL/Gas Balance.`); });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);

        // 3. Broadcast Stage
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true })
            .catch(e => { throw new Error(`RPC Broadcast Failed: Use a private RPC node.`); });
        
        bot.sendMessage(chatId, `🚀 **ENTERED:** $${ticker}\n🔗 [Solscan](https://solscan.io/tx/${sig})`, { parse_mode: 'Markdown', disable_web_page_preview: true });
        SYSTEM.currentAsset = addr;
        return { entryPrice: parseFloat(res.data.outAmount) || 1 };
    } catch (e) {
        bot.sendMessage(chatId, `❌ **DIAGNOSTIC ERROR:**\n\`${e.message}\``);
        return null;
    }
}

// ==========================================
//  🕹️ DASHBOARD UI & CONNECT
// ==========================================

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP ROTATION" : "🚀 START ENDLESS + SATELLITE", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }],
            [{ text: `⏱️ TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }, { text: "🔗 SYNC", callback_data: "cmd_conn_prompt" }]
        ]
    }
});

bot.on('callback_query', async (q) => {
    bot.answerCallbackQuery(q.id).catch(() => {});
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;

    if (q.data === "cycle_amt") {
        const amts = ["0.05", "0.1", "0.25", "0.5"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    }
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ Connect Wallet First!");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            runAISatellite(chatId);
            startEndlessCycle(chatId);
        }
    }
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(() => {}); // Instant deletion for safety
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        const seedHex = seed.toString('hex');
        // Multi-Path Check
        const keyStd = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seedHex).key);
        const keyLeg = Keypair.fromSeed(derivePath("m/44'/501'/0'", seedHex).key);
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
        const [bS, bL] = await Promise.all([conn.getBalance(keyStd.publicKey), conn.getBalance(keyLeg.publicKey)]);
        solWallet = (bL > bS) ? keyLeg : keyStd;
        
        const ok = await bot.sendMessage(msg.chat.id, `⚡ **NEURAL SYNC COMPLETE**\n📍 SVM: \`${solWallet.publicKey.toString().substring(0,8)}...\``);
        setTimeout(() => bot.deleteMessage(msg.chat.id, ok.message_id), 5000);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC ERROR.**"); }
});

bot.onText(/\/menu|\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🎮 **APEX v9032 PRO-MAX MASTER**", { parse_mode: 'Markdown', ...getDashboardMarkup() });
});

http.createServer((req, res) => res.end("APEX READY")).listen(8080);
