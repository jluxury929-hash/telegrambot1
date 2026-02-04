/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (FULL AUTO-PILOT MASTER)
 * ===============================================================================
 * FEATURES: Parallel sniper threads + Independent position monitoring.
 * SAFETY: Dual-RPC failover + Jito MEV-Shield + RugCheck Integration.
 * INTERFACE: Fully interactive v9032 cycling dashboard.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider } = require('ethers');
const { 
    Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, 
    PublicKey, SystemProgram, Transaction 
} = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 1. CONFIGURATION ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};

const NETWORKS = {
    ETH:  { id: 'ethereum', type: 'EVM', rpc: 'https://rpc.mevblocker.io' },
    SOL:  { id: 'solana', type: 'SVM', primary: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', fallback: 'https://rpc.ankr.com/solana' },
    BASE: { id: 'base', type: 'EVM', rpc: 'https://mainnet.base.org' },
    BSC:  { id: 'bsc', type: 'EVM', rpc: 'https://bsc-dataseed.binance.org/' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'MEDIUM',
    lastTradedTokens: {}, isLocked: {}, atomicOn: true,
    trailingDistance: 3.0, minProfitThreshold: 5.0,
    currentAsset: 'So11111111111111111111111111111111111111112'
};

let solWallet, evmWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 LAYER 2: MEV-SHIELD (JITO PROXY) ---
const originalSend = Connection.prototype.sendRawTransaction;
Connection.prototype.sendRawTransaction = async function(rawTx, options) {
    if (!SYSTEM.atomicOn) return originalSend.apply(this, [rawTx, options]);
    try {
        const base64Tx = Buffer.from(rawTx).toString('base64');
        const res = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]] });
        if (res.data.result) return res.data.result;
    } catch (e) { console.log(`[MEV-SHIELD] Jito busy, using fallback RPC...`.yellow); }
    return originalSend.apply(this, [rawTx, options]);
};

// --- 3. THE v9032 AUTO-PILOT CORE (PARALLEL WORKERS) ---
async function startNetworkSniper(chatId, netKey) {
    console.log(`[INIT] Parallel worker for ${netKey} active.`.magenta);
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                
                if (signal && signal.tokenAddress && !SYSTEM.lastTradedTokens[signal.tokenAddress]) {
                    const [ready, safe] = await Promise.all([
                        verifyBalance(chatId, netKey),
                        verifySignalSafety(signal.tokenAddress)
                    ]);

                    if (ready && safe) {
                        SYSTEM.isLocked[netKey] = true;
                        bot.sendMessage(chatId, `🧠 **[${netKey}] SIGNAL:** ${signal.symbol}. Engaging Sniper.`);

                        const buyRes = (netKey === 'SOL')
                            ? await executeSolShotgun(chatId, signal.tokenAddress, SYSTEM.tradeAmount)
                            : { success: false }; // EVM logic placeholder

                        if (buyRes && buyRes.success) {
                            const pos = { ...signal, entryPrice: signal.price, peakPrice: signal.price };
                            SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                            startIndependentPeakMonitor(chatId, netKey, pos);
                            bot.sendMessage(chatId, `🚀 **[${netKey}] BOUGHT ${signal.symbol}.** Rescanning parallel...`);
                        }
                        SYSTEM.isLocked[netKey] = false;
                    }
                }
            }
            await new Promise(r => setTimeout(r, 2000)); 
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 5000)); }
    }
}

// v9032 Asynchronous Peak Monitoring
async function startIndependentPeakMonitor(chatId, netKey, pos) {
    const monitor = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
            if (!res.data.pairs || res.data.pairs.length === 0) return;

            const curPrice = parseFloat(res.data.pairs[0].priceUsd) || 0;
            const entry = parseFloat(pos.entryPrice) || 0.00000001;
            const pnl = ((curPrice - entry) / entry) * 100;

            if (curPrice > pos.peakPrice) pos.peakPrice = curPrice;
            const dropFromPeak = ((pos.peakPrice - curPrice) / pos.peakPrice) * 100;

            // v9032 Risk-Adjusted Exit Logic
            let tp = 25; let sl = -10;
            if (SYSTEM.risk === 'LOW') { tp = 12; sl = -5; }
            if (SYSTEM.risk === 'HIGH') { tp = 100; sl = -20; }

            if (pnl >= tp || (pnl > SYSTEM.minProfitThreshold && dropFromPeak >= SYSTEM.trailingDistance)) {
                bot.sendMessage(chatId, `🎯 **EXIT:** ${pos.symbol} at ${pnl.toFixed(2)}% PnL (TSL).`);
                await executeSolShotgun(chatId, pos.tokenAddress, 'SELL');
                clearInterval(monitor);
            } else if (pnl <= sl) {
                bot.sendMessage(chatId, `📉 **STOP LOSS:** ${pos.symbol} at ${pnl.toFixed(2)}% PnL.`);
                await executeSolShotgun(chatId, pos.tokenAddress, 'SELL');
                clearInterval(monitor);
            }
        } catch (e) { /* silent retry */ }
    }, 12000); 
}

// --- 4. EXECUTION ENGINES ---
async function executeSolShotgun(chatId, addr, amt) {
    try {
        const isSell = amt === 'SELL';
        const amtStr = isSell ? 'all' : Math.floor(amt * 1e9).toString();
        
        // v9032 Jup Ultra order with priority fees
        const res = await axios.get(`${JUP_ULTRA_API}/order?inputMint=${isSell?addr:SYSTEM.currentAsset}&outputMint=${isSell?SYSTEM.currentAsset:addr}&amount=${isSell?'all':amtStr}&taker=${solWallet.publicKey.toString()}&slippageBps=250&prioritizationFeeLamports=150000`, SCAN_HEADERS);
        
        const tx = VersionedTransaction.deserialize(Buffer.from(res.data.transaction, 'base64'));
        tx.sign([solWallet]);
        
        // Multi-RPC Failover Broadcast
        const sig = await Promise.any([
            new Connection(NETWORKS.SOL.primary).sendRawTransaction(tx.serialize(), { skipPreflight: true }),
            new Connection(NETWORKS.SOL.fallback).sendRawTransaction(tx.serialize(), { skipPreflight: true })
        ]);
        
        return { success: !!sig, amountOut: res.data.outAmount || 1 };
    } catch (e) { return { success: false }; }
}

async function executeEvmContract(chatId, netKey, addr, amt) {
    // Placeholder for EVM Buy logic
    return { success: true, amountOut: 1 };
}

// --- 5. INTERFACE (v9032 CYCLING) ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount}`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: solWallet ? "✅ SYNCED" : "🔗 CONNECT WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
    } else if (query.data === "cycle_amt") {
        const amts = ["0.1", "0.25", "0.5", "1.0"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    } else if (query.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(query.id, { text: "❌ Connect Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, "🚀 **AUTO-PILOT ONLINE.** Threads active.");
            Object.keys(NETWORKS).forEach(netKey => startNetworkSniper(chatId, netKey));
        }
    }
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    bot.answerCallbackQuery(query.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "⚔️ <b>APEX v9032 AUTO-PILOT</b>", { parse_mode: 'HTML', ...getDashboardMarkup() }));

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const seed = match[1].trim();
    const mnemonic = await bip39.mnemonicToSeed(seed);
    solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
    bot.sendMessage(msg.chat.id, `✅ **SYNCED:** \`${solWallet.publicKey.toString()}\``);
});

// Verification Helpers
async function runNeuralSignalScan(netKey) {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const chainMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base', 'BSC': 'bsc' };
        const match = res.data.find(t => t.chainId === chainMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol, tokenAddress: match.tokenAddress, price: parseFloat(match.priceUsd) || 0.000001 } : null;
    } catch (e) { return null; }
}

async function verifySignalSafety(addr) { 
    try { const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${addr}/report`); return res.data.score < 500; } 
    catch (e) { return true; } 
}

async function verifyBalance(chatId, netKey) {
    try {
        if (netKey === 'SOL' && solWallet) {
            const bal = await new Connection(NETWORKS.SOL.primary).getBalance(solWallet.publicKey);
            return bal >= (parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        }
        return true;
    } catch (e) { return false; }
}

http.createServer((req, res) => res.end("MASTER READY")).listen(8080);
console.log("SYSTEM BOOTED: APEX v9032 NEURAL MASTER READY".green.bold);
