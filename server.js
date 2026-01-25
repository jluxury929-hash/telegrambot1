/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9053 (PnL VOLATILITY MASTER)
 * ===============================================================================
 * NEW: Real-time PnL Tracking (Current Price vs Entry Price).
 * NEW: Dynamic PnL UI (Green/Red sentiment indicators).
 * FIX: Symbol mapping ($undefined fix) for DexScreener v1 Boosts.
 * FIX: Button Spinning & /amount command fully captured.
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
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: false, 
    currentAsset: 'So11111111111111111111111111111111111111112', // Base SOL
    entryPrice: 0, currentPnL: 0, currentSymbol: 'SOL'
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

// --- 3. COMMANDS & BUTTONS ---

bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>⚡️ APEX PREDATOR v9053 ⚡️</b>\n<i>PnL Tracking Engine Active.</i>", { 
        parse_mode: 'HTML', ...getDashboardMarkup() 
    });
});

bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    SYSTEM.tradeAmount = match[1];
    bot.sendMessage(msg.chat.id, `✅ <b>AMT UPDATED:</b> <code>${SYSTEM.tradeAmount} SOL</code>`, { parse_mode: 'HTML' });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

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
        if (!solWallet) return bot.sendMessage(chatId, "⚠️ <b>Sync Wallet!</b>", { parse_mode: 'HTML' });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startHeartbeat(chatId);
    } else if (query.data === "cmd_status") {
        return runStatusDashboard(chatId);
    }
    
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
});

// --- 4. HEARTBEAT & PnL CALCULATION ---

async function startHeartbeat(chatId) {
    if (!SYSTEM.autoPilot) return;

    try {
        // Update PnL for current holding if we aren't in native SOL
        if (SYSTEM.currentAsset !== 'So11111111111111111111111111111111111111112') {
            const priceRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${SYSTEM.currentAsset}`, SCAN_HEADERS);
            const currentPrice = parseFloat(priceRes.data.pairs[0].priceUsd);
            SYSTEM.currentPnL = ((currentPrice - SYSTEM.entryPrice) / SYSTEM.entryPrice) * 100;
        }

        if (!SYSTEM.isLocked) {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const match = res.data.find(t => t.chainId === 'solana' && t.tokenAddress && !SYSTEM.lastTradedTokens[t.tokenAddress]);

            if (match) {
                SYSTEM.isLocked = true;
                const symbol = match.symbol || "TKN";
                // Get Entry Price
                const pRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${match.tokenAddress}`, SCAN_HEADERS);
                const entry = parseFloat(pRes.data.pairs[0].priceUsd);

                bot.sendMessage(chatId, `🧠 <b>SIGNAL:</b> <code>$${symbol}</code>\nRotating capital...`, { parse_mode: 'HTML' });
                await executeRotation(chatId, match.tokenAddress, symbol, entry);
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) { console.log("Scan error".red); }
    setTimeout(() => startHeartbeat(chatId), 4000);
}

// --- 5. EXECUTION ---

async function executeRotation(chatId, targetToken, symbol, entry) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        const quote = await axios.get(`${JUP_ULTRA_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=150`);
        const { swapTransaction } = (await axios.post(`${JUP_ULTRA_API}/swap`, {
            quoteResponse: quote.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        })).data;

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        bot.sendMessage(chatId, `✅ <b>ROTATED TO $${symbol}</b>\n<a href="https://solscan.io/tx/${sig}">Solscan Link</a>`, { 
            parse_mode: 'HTML', disable_web_page_preview: true 
        });

        SYSTEM.currentAsset = targetToken;
        SYSTEM.entryPrice = entry;
        SYSTEM.currentSymbol = symbol;
        SYSTEM.lastTradedTokens[targetToken] = true;
    } catch (e) { console.log("Swap failed".red); }
}

// --- 6. STATUS DASHBOARD ---

async function runStatusDashboard(chatId) {
    if (!solWallet) return;
    const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
    const bal = (await conn.getBalance(solWallet.publicKey)) / LAMPORTS_PER_SOL;
    
    const pnlColor = SYSTEM.currentPnL >= 0 ? "🟢" : "🔴";
    const pnlStr = SYSTEM.currentAsset === 'So11111111111111111111111111111111111111112' 
        ? "0.00%" 
        : `${pnlColor} ${SYSTEM.currentPnL.toFixed(2)}%`;

    let msg = `📊 <b>APEX LIVE PERFORMANCE</b>\n<code>━━━━━━━━━━━━━━━━━━━━━━━━━━━━</code>\n`;
    msg += `🔹 <b>BAL:</b> <code>${toExact(bal, 4)} SOL</code>\n`;
    msg += `🔹 <b>ASSET:</b> <code>$${SYSTEM.currentSymbol}</code>\n`;
    msg += `🔹 <b>PnL:</b> <b>${pnlStr}</b>\n`;
    msg += `<code>━━━━━━━━━━━━━━━━━━━━━━━━━━━━</code>`;

    bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const raw = match[1].trim();
    try {
        const seed = await bip39.mnemonicToSeed(raw);
        const key = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        solWallet = key;
        bot.sendMessage(msg.chat.id, `🔗 <b>WALLET SYNCED:</b>\n<code>${key.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Sync failed."); }
});

http.createServer((req, res) => res.end("APEX v9053 READY")).listen(8080);
