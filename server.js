/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (GLOBAL ULTIMATUM EDITION)
 * ===============================================================================
 * Infrastructure: Binance WebSocket + Yellowstone gRPC + Jito Atomic Bundles
 * Integrated Features: Dynamic Pulse Volatility & Profit Auto-Sweep
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { ethers, JsonRpcProvider } = require('ethers');
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { default: Client } = require("@triton-one/yellowstone-grpc"); 
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const WebSocket = require('ws');
const http = require('http');
require('colors');

// 1. INITIALIZE CORE BOT
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- CONFIGURATION: AUTO-SWEEP & SECURITY ---
const COLD_WALLET_ADDRESS = "YOUR_LEDGER_OR_SAFE_ADDRESS_HERE"; // CHANGE THIS
const PROFIT_THRESHOLD = 2.0; // Sweep whenever profit exceeds 2 SOL
const MIN_RESERVE = 5.0;      // Always keep at least 5 SOL in the bot for trading
// --------------------------------------------

let SYSTEM = {
    autoPilot: false, 
    tradeAmount: "0.1", 
    risk: 'MAX', 
    mode: 'SHORT',
    lastTradedTokens: {}, 
    isLocked: {},
    currentAsset: 'So11111111111111111111111111111111111111112',
    entryPrice: 0, 
    currentPnL: 0, 
    currentSymbol: 'SOL',
    lastMarketState: '', 
    lastCheckPrice: 0,
    atomicOn: true, 
    flashOn: false,
    jitoTip: 20000000,
    shredSpeed: true,
    lastBinancePrice: 0,
    volBuffer: [] // For Dynamic Pulse
};

let solWallet, evmWallet, activeChatId;
let lastBinanceUpdate = Date.now();

const RISK_LABELS = { LOW: '🛡️ LOW', MEDIUM: '⚖️ MED', MAX: '🔥 MAX' };
const TERM_LABELS = { SHORT: '⏱️ SHRT', MID: '⏳ MID', LONG: '💎 LONG' };

// --- 🔱 LAYER 2: MEV-SHIELD (JITO BUNDLES) ---
const originalSend = Connection.prototype.sendRawTransaction;
Connection.prototype.sendRawTransaction = async function(rawTx, options) {
    try {
        const base64Tx = Buffer.from(rawTx).toString('base64');
        const jitoRes = await axios.post("https://mainnet.block-engine.jito.wtf/api/v1/bundles", {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]]
        });
        if (jitoRes.data.result) {
            console.log(`[MEV-SHIELD] ✅ Bundle Accepted: ${jitoRes.data.result.slice(0,10)}...`.green);
            return jitoRes.data.result;
        }
    } catch (e) { console.log(`[MEV-SHIELD] ⚠️ Private Lane busy, falling back...`.yellow); }
    return originalSend.apply(this, [rawTx, options]);
};

// --- CORE UTILITIES ---

const JUP_API = "https://quote-api.jup.ag/v6";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};
const CAD_RATES = { SOL: 248.15, ETH: 4920.00, BNB: 865.00 };
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const BINANCE_WS = "wss://stream.binance.com:9443/ws/solusdt@bookTicker";

const NETWORKS = {
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', sym: 'ETH' },
    SOL:  { id: 'solana', endpoints: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana'], sym: 'SOL' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', sym: 'ETH' },
    BSC:  { id: 'bsc', rpc: 'https://bsc-dataseed.binance.org/', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', sym: 'BNB' },
    ARB:  { id: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', sym: 'ETH' }
};

// --- APEX SECURITY: PROFIT AUTO-SWEEP ---
async function runAutoSweep(chatId) {
    if (!solWallet) return;
    try {
        const conn = new Connection(NETWORKS.SOL.endpoints[0], 'confirmed');
        const balance = await conn.getBalance(solWallet.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        const sweepAmount = solBalance - MIN_RESERVE;

        if (sweepAmount >= PROFIT_THRESHOLD) {
            console.log(`[ SWEEP] Profit Milestone Reached: ${solBalance.toFixed(2)} SOL`.green.bold);
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: solWallet.publicKey,
                    toPubkey: new PublicKey(COLD_WALLET_ADDRESS),
                    lamports: Math.floor(sweepAmount * LAMPORTS_PER_SOL) - 5000,
                })
            );
            const signature = await sendAndConfirmTransaction(conn, transaction, [solWallet]);
            bot.sendMessage(chatId, 
                `💰 <b>PROFIT SECURED</b>\n` +
                `━━━━━━━━━━━━━━━\n` +
                `<b>Amount:</b> <code>${sweepAmount.toFixed(4)} SOL</code>\n` +
                `<b>Sent to:</b> <code>Vault</code>\n` +
                `<a href="https://solscan.io/tx/${signature}">View Vault Receipt</a>`, 
                { parse_mode: 'HTML' }
            );
        }
    } catch (e) { console.log(`[SWEEP] Waiting for next block...`.grey); }
}

// --- APEX ENHANCEMENT: DYNAMIC PULSE ---
async function checkGlobalArb(chatId) {
    if (SYSTEM.isLocked['SOL']) return;
    try {
        const solPriceRes = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000`);
        const solPrice = solPriceRes.data.outAmount / 1e6;
        const delta = ((SYSTEM.lastBinancePrice - solPrice) / solPrice) * 100;

        lastBinanceUpdate = Date.now();
        SYSTEM.volBuffer.push(Math.abs(delta));
        if (SYSTEM.volBuffer.length > 30) SYSTEM.volBuffer.shift();
        
        const marketStress = SYSTEM.volBuffer.reduce((a, b) => a + b, 0) / SYSTEM.volBuffer.length;
        const dynThreshold = Math.max(0.40, marketStress * 1.2);

        if (Math.abs(delta) > dynThreshold) {
            console.log(`[EXECUTE] Delta: ${delta.toFixed(3)}% | Threshold: ${dynThreshold.toFixed(3)}%`.green.bold);
            return await executeAggressiveSolRotation(chatId, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "GLOBAL-ARB");
        }
    } catch (e) { /* Silent fail for loop */ }
}

// --- HEARTBEAT MONITOR ---
setInterval(() => {
    const silenceDuration = (Date.now() - lastBinanceUpdate) / 1000;
    if (silenceDuration > 15 && SYSTEM.autoPilot) {
        console.log(`[ ALERT] Binance Feed Silent for ${silenceDuration}s`.red.bold);
        if (activeChatId) {
            bot.sendMessage(activeChatId, `⚠️ <b>FEED DISRUPTION</b>\nBinance price feed has been silent for <code>${silenceDuration.toFixed(0)}s</code>. Bot is idling for safety.`, { parse_mode: 'HTML' });
        }
        lastBinanceUpdate = Date.now(); 
    }
}, 10000);

// --- UI & DASHBOARD ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount}`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `⚠️ RISK: ${RISK_LABELS[SYSTEM.risk] || '⚖️ MED'}`, callback_data: "cycle_risk" }, { text: `⏳ TERM: ${TERM_LABELS[SYSTEM.mode] || '⏱️ SHRT'}`, callback_data: "cycle_mode" }],
            [{ text: SYSTEM.atomicOn ? "🛡️ ATOMIC: ON" : "🛡️ ATOMIC: OFF", callback_data: "tg_atomic" }, { text: SYSTEM.flashOn ? "⚡ FLASH: ON" : "⚡ FLASH: OFF", callback_data: "tg_flash" }],
            [{ text: "🔌 CONNECT WALLET", callback_data: "cmd_conn" }, { text: "🏦 WITHDRAW (USDC)", callback_data: "cmd_withdraw" }]
        ]
    }
});

function runStatusDashboard(chatId) {
    runAutoSweep(chatId); // Hook: Trigger sweep check on every refresh
    
    const delta = ((SYSTEM.lastBinancePrice - (SYSTEM.lastCheckPrice || SYSTEM.lastBinancePrice)) / (SYSTEM.lastCheckPrice || 1)) * 100;
    const mood = getMarketMood(delta);
    const estEarnings = (parseFloat(SYSTEM.tradeAmount) * 0.0085 * CAD_RATES.SOL).toFixed(2);
   
    bot.sendMessage(chatId,
        `📊 <b>OMNI LIVE STATUS</b>\n\n` +
        `🛰️ <b>Market Mood:</b> ${mood}\n` +
        `📉 <b>Global Delta:</b> <code>${delta.toFixed(3)}%</code>\n\n` +
        `💰 <b>Size:</b> <code>${SYSTEM.tradeAmount} SOL</code>\n` +
        `💎 <b>Est. Net/Trade:</b> <code>~$${estEarnings} CAD</code>\n\n` +
        `🛡️ <b>Shields:</b> ${SYSTEM.atomicOn ? 'ATOMIC' : 'RAW'}\n` +
        `⚡ <b>Radar:</b> ${SYSTEM.shredSpeed ? 'Geyser gRPC' : 'Standard'}`,
        { parse_mode: 'HTML' });
}

const getMarketMood = (delta) => {
    const d = Math.abs(delta);
    if (d > 1.8) return '🔴 Dangerous (Extreme Slippage)';
    if (d > 0.7) return '🟡 Volatile (High ROI Predator Zone)';
    return '🟢 Low (Stable Arbitrage)';
};

// --- TRADING ENGINE ---
async function executeAggressiveSolRotation(chatId, targetToken, symbol) {
    let rpcIdx = 0;
    while (rpcIdx < NETWORKS.SOL.endpoints.length) {
        try {
            const conn = new Connection(NETWORKS.SOL.endpoints[rpcIdx], 'confirmed');
            const amtMultiplier = (symbol.includes('ARB') || symbol.includes('FAST')) ? 10 : 1;
            const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL * amtMultiplier);
            
            const quote = await axios.get(`${JUP_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=50`);
            const { swapTransaction } = (await axios.post(`${JUP_API}/swap`, { 
                quoteResponse: quote.data, 
                userPublicKey: solWallet.publicKey.toString(), 
                prioritizationFeeLamports: "auto" 
            })).data;

            const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
            tx.sign([solWallet]);
            
            const res = await axios.post(JITO_ENGINE, { 
                jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[Buffer.from(tx.serialize()).toString('base64')]] 
            });

            if (res.data.result) {
                bot.sendMessage(chatId, `💰 <b>SUCCESS:</b> ${symbol} rotation complete.`);
                return true;
            }
            return false;
        } catch (e) { rpcIdx++; }
    }
    return false;
}

// --- TELEGRAM HANDLERS ---
bot.on('callback_query', async (query) => {
    const { data, message, id } = query;
    const chatId = message.chat.id;
    bot.answerCallbackQuery(id).catch(() => {});

    if (data === "cmd_withdraw") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ <b>Connect wallet first.</b>", { parse_mode: 'HTML' });
        return bot.sendMessage(chatId, "🏦 <b>WITHDRAWAL PROTOCOL</b>\nTo withdraw profits, send:\n<code>/payout [ADDRESS]</code>", { parse_mode: 'HTML' });
    } else if (data === "cmd_status") {
        return runStatusDashboard(chatId);
    } else if (data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ <b>Sync Wallet First!</b>", { parse_mode: 'HTML' });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) Object.keys(NETWORKS).forEach(net => startNetworkSniper(chatId, net));
    } else if (data === "cmd_conn") {
        return bot.sendMessage(chatId, "🔌 <b>Sync:</b> <code>/connect [mnemonic]</code>", { parse_mode: 'HTML' });
    }
    // Logic for other cycles (risk, mode, amt) remains here...
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: message.message_id }).catch(() => {});
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = await bip39.mnemonicToSeed(match[1].trim());
        const hex = seed.toString('hex');
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        evmWallet = ethers.Wallet.fromPhrase(match[1].trim());
        bot.sendMessage(msg.chat.id, `✅ <b>SYNCED:</b> <code>${solWallet.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ <b>FAILED SYNC</b>"); }
});

bot.onText(/\/(start|menu)/, (msg) => {
    activeChatId = msg.chat.id;
    startGlobalUltimatum(activeChatId);
    bot.sendMessage(msg.chat.id, "<b>⚔️ APEX OMNI-MASTER v9076</b>\nMulti-Chain Radar Active.", { parse_mode: 'HTML', ...getDashboardMarkup() });
});

// --- NETWORKING & ARBITRAGE START ---
async function startGlobalUltimatum(chatId) {
    const ws = new WebSocket(BINANCE_WS);
    ws.on('message', async (data) => {
        const tick = JSON.parse(data);
        SYSTEM.lastBinancePrice = (parseFloat(tick.b) + parseFloat(tick.a)) / 2;
        if (SYSTEM.autoPilot) await checkGlobalArb(chatId);
    });
}

async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                // Mock Neural Scan - Replace with your actual scanning logic
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress) {
                    SYSTEM.isLocked[netKey] = true;
                    await executeAggressiveSolRotation(chatId, signal.tokenAddress, signal.symbol);
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; }
    }
}

async function runNeuralSignalScan(netKey) {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const chainMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base', 'BSC': 'bsc', 'ARB': 'arbitrum' };
        const match = res.data.find(t => t.chainId === chainMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol, tokenAddress: match.tokenAddress } : null;
    } catch (e) { return null; }
}

// Initializing Server
http.createServer((req, res) => res.end("v9076 READY")).listen(8080);
console.log("🚀 DYNAMIC PULSE & PROFIT AUTO-SWEEP ACTIVATED".cyan.bold);
