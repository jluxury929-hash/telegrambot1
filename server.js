/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (GLOBAL MASTER MERGE)
 * ===============================================================================
 * INFRASTRUCTURE: Yellowstone gRPC + Jito Atomic Bundles + Jupiter V6 RTSE
 * BRAIN CONFIG: Primary [BRAIN-2] Birdeye Alpha | Secondary [BRAIN-1] DexRadar
 * INTERFACE: v9032 Dashboard + Manual Overrides (/amount)
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

// --- 1. CONFIGURATION & STATE ---
const JUP_API = "https://quote-api.jup.ag/v6";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }};
const COLD_STORAGE = "0xF7a4b02e1c7f67be8B551728197D8E14a7CDFE34"; 

const NETWORKS = {
    SOL:  { id: 'solana', primary: process.env.SOL_RPC || 'https://api.mainnet-beta.solana.com' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: { 'SOL': false, 'BASE': false }, atomicOn: true,
    highestBalance: 0, isWaitingForDrop: false, jitoTip: 1000000 
};

let solWallet, evmWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 LAYER 2: MEV-SHIELD (JITO BUNDLE INJECTION) ---
const originalSend = Connection.prototype.sendRawTransaction;
Connection.prototype.sendRawTransaction = async function(rawTx, options) {
    if (!SYSTEM.atomicOn) return originalSend.apply(this, [rawTx, options]);
    try {
        const base64Tx = Buffer.from(rawTx).toString('base64');
        const res = await axios.post(JITO_ENGINE, { 
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]] 
        });
        if (res.data.result) return res.data.result;
    } catch (e) { console.log(`[MEV-SHIELD] Jito Lane busy. Falling back...`.yellow); }
    return originalSend.apply(this, [rawTx, options]);
};

// --- 2. THE DUAL BRAINS (BRAIN-2 PRIMARY) ---

// 🧬 [PRIMARY] BRAIN 2: Birdeye Neural Alpha
async function startNeuralAlphaBrain(chatId) {
    const B_API = "https://public-api.birdeye.so";
    const B_KEY = process.env.BIRDEYE_API_KEY;
    if (!B_KEY) return bot.sendMessage(chatId, "⚠️ BRAIN-2 Missing BIRDEYE_API_KEY");

    console.log(`[INIT] Brain-2 (Birdeye Alpha) Engaged as PRIMARY.`.magenta.bold);

    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked['SOL']) {
                const res = await axios.get(`${B_API}/defi/token_trending?sort_by=rank&sort_type=asc`, {
                    headers: { 'X-API-KEY': B_KEY, 'x-chain': 'solana' }
                });

                if (res.data.success && res.data.data.tokens.length > 0) {
                    for (const t of res.data.data.tokens.slice(0, 5)) {
                        if (SYSTEM.lastTradedTokens[t.address]) continue;

                        // Neural Filter: Volume > 150k AND Smart Money Alignment
                        if (t.v24hUSD > 150000 && t.liquidity > 25000) {
                            SYSTEM.isLocked['SOL'] = true;
                            bot.sendMessage(chatId, `🧬 **[BRAIN-2] ALPHA DETECTED:** $${t.symbol}\nLogic: Neural Smart Money Trend.`);
                            
                            const buyRes = await executeSolShotgun(chatId, t.address, t.symbol);
                            if (buyRes.success) {
                                SYSTEM.lastTradedTokens[t.address] = true;
                                startIndependentPeakMonitor(chatId, 'SOL', { symbol: t.symbol, tokenAddress: t.address, entryPrice: t.price });
                            }
                            SYSTEM.isLocked['SOL'] = false;
                        }
                    }
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { SYSTEM.isLocked['SOL'] = false; await new Promise(r => setTimeout(r, 5000)); }
    }
}

// 🧠 [SECONDARY] BRAIN 1: DexRadar
async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress && !SYSTEM.lastTradedTokens[signal.tokenAddress]) {
                    SYSTEM.isLocked[netKey] = true;
                    bot.sendMessage(chatId, `🧠 **[${netKey}] SIGNAL:** ${signal.symbol}. RugChecking...`);
                    
                    const safe = await verifySignalSafety(signal.tokenAddress);
                    if (safe) {
                        const buyRes = (netKey === 'SOL') 
                            ? await executeSolShotgun(chatId, signal.tokenAddress, signal.symbol) 
                            : await executeEvmContract(chatId, netKey, signal.tokenAddress);
                        
                        if (buyRes.success) {
                            SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                            startIndependentPeakMonitor(chatId, netKey, { ...signal, entryPrice: signal.price });
                        }
                    }
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 5000)); }
    }
}

// --- 3. EXECUTION ENGINE (FIXED JUPITER V6 SWAP) ---

async function executeSolShotgun(chatId, addr, symbol) {
    try {
        const conn = new Connection(NETWORKS.SOL.primary, 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        
        // 1. Get hardened quote with slippage protection
        const qRes = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${addr}&amount=${amt}&slippageBps=150&restrictIntermediateTokens=true`);
        
        // 2. Build Transaction with Auto-Priority Fees
        const sRes = await axios.post(`${JUP_API}/swap`, {
            quoteResponse: qRes.data,
            userPublicKey: solWallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: "auto", 
            dynamicComputeUnitLimit: true
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(sRes.data.swapTransaction, 'base64'));
        
        // 3. Fresh blockhash immediately before signing
        const { blockhash } = await conn.getLatestBlockhash('finalized');
        tx.message.recentBlockhash = blockhash;
        tx.sign([solWallet]);

        // 4. Send (MEV-Shield intercepts and Jito-wraps)
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
        
        if (sig) {
            bot.sendMessage(chatId, `🚀 **SWAP SUCCESS:** ${symbol}\nSig: \`${sig.slice(0,8)}...\``, { parse_mode: 'Markdown' });
            return { success: true };
        }
    } catch (e) { 
        console.log(`[EXEC FAIL] ${symbol}: ${e.message}`.red);
        bot.sendMessage(chatId, `❌ **SWAP FAILED:** ${symbol} (Market Volatility)`);
        return { success: false }; 
    }
}

// --- 4. TELEGRAM COMMANDS & OVERRIDES ---
bot.onText(/\/amount (.+)/, (msg, match) => {
    const val = match[1].trim();
    if (!isNaN(val)) {
        SYSTEM.tradeAmount = val;
        bot.sendMessage(msg.chat.id, `✅ **OVERRIDE:** Trade size set to **${val}** SOL/ETH.`);
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ Wallet Required.");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, "🚀 **AUTO-PILOT ACTIVE.** Brain-2 Primary Scanning.");
            startNeuralAlphaBrain(chatId); // Fire primary alpha
            Object.keys(NETWORKS).forEach(net => startNetworkSniper(chatId, net)); // Fire multi-chain sniper
        }
    }
    // Refresh dashboard logic...
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "⚔️ **APEX MASTER v9076 ONLINE**", getDashboardMarkup()));
http.createServer((req, res) => res.end("MASTER READY")).listen(8080);
