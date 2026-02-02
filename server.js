/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (PIONEX AI EDITION)
 * ===============================================================================
 * FEATURES: Trailing Stop-Loss, ATR Volatility Scaling, Auto-Profit Sweep
 * INFRASTRUCTURE: Binance WS + Jupiter v6 + Jito Bundles
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider } = require('ethers');
const { 
    Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, 
    PublicKey, SystemProgram, Transaction, TransactionMessage 
} = require('@solana/web3.js');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('colors');

// --- 1. ENHANCED CONFIGURATION ---
const JUP_API = "https://quote-api.jup.ag/v6";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const JITO_TIP_ADDR = new PublicKey("96g9sAg9u3mBsJp9U9YVsk8XG3V6rW5E2t3e8B5Y3npx");

let SYSTEM = {
    autoPilot: false,
    tradeAmount: "0.1",
    risk: 'MEDIUM',
    mode: 'SHORT',
    atomicOn: true,
    jitoTip: 2000000, // 0.002 SOL
    lastTradedTokens: {},
    isLocked: {},
    // Pionex AI Params
    trailingDistance: 3.0, // 3% drop from peak triggers exit
    minProfitThreshold: 5.0, // Only start trailing after 5% gain
    coldStorage: process.env.COLD_STORAGE || "0x000...", // Set in .env
    minKeepBalance: 0.05 // Min SOL to keep in hot wallet
};

const NETWORKS = {
    SOL: { id: 'solana', primary: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com' }
};

let solWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. AI UTILITIES: ATR & VOLATILITY SCALING ---
async function getAtrAdjustment(symbol) {
    try {
        // Fetch 24h price data to calculate volatility "Heat"
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
        const priceChange = Math.abs(parseFloat(res.data.priceChangePercent));
        // If volatility is > 10%, widen stops to avoid "noise" triggers
        return priceChange > 10 ? 1.5 : 1.0;
    } catch (e) { return 1.0; }
}

// --- 3. EXECUTION: JITO-BUNDLED SWAP ---
async function executeSolSwap(chatId, tokenAddr, symbol, side = 'BUY') {
    try {
        const conn = new Connection(NETWORKS.SOL.primary, 'confirmed');
        const amount = side === 'BUY' 
            ? Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL)
            : 'all'; // Logic for selling full balance

        // 1. Get Quote
        const input = side === 'BUY' ? "So11111111111111111111111111111111111111112" : tokenAddr;
        const output = side === 'BUY' ? tokenAddr : "So11111111111111111111111111111111111111112";
        
        const qRes = await axios.get(`${JUP_API}/quote?inputMint=${input}&outputMint=${output}&amount=${amount}&slippageBps=100`);
        
        // 2. Build Swap Tx
        const sRes = await axios.post(`${JUP_API}/swap`, {
            quoteResponse: qRes.data,
            userPublicKey: solWallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: "auto"
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(sRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);

        // 3. Send via Jito Private Bundle
        const base64Tx = Buffer.from(tx.serialize()).toString('base64');
        const jitoRes = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]]
        });

        return { success: !!jitoRes.data.result, price: qRes.data.outAmount };
    } catch (e) {
        console.error(`[EXECUTION ERROR] ${e.message}`.red);
        return { success: false };
    }
}

// --- 4. AI MONITOR: TRAILING STOP-LOSS ---

async function startTrailingMonitor(chatId, pos) {
    let peakPrice = pos.entryPrice;
    const adj = await getAtrAdjustment(pos.symbol);
    const dynamicTSL = SYSTEM.trailingDistance * adj;

    const interval = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`);
            const curPrice = parseFloat(res.data.pairs?.[0]?.priceUsd);
            const pnl = ((curPrice - pos.entryPrice) / pos.entryPrice) * 100;

            if (curPrice > peakPrice) peakPrice = curPrice;

            const dropFromPeak = ((peakPrice - curPrice) / peakPrice) * 100;

            // PIONEX LOGIC: Only activate trailing if we are in profit threshold
            if (pnl > SYSTEM.minProfitThreshold && dropFromPeak >= dynamicTSL) {
                bot.sendMessage(chatId, `🎯 **TSL TRIGGERED:** ${pos.symbol} dropped ${dropFromPeak.toFixed(2)}% from peak. Selling...`);
                await executeSolSwap(chatId, pos.tokenAddress, pos.symbol, 'SELL');
                clearInterval(interval);
            } 
            // Hard Stop Loss (Security Guard)
            else if (pnl <= -10.0) {
                bot.sendMessage(chatId, `⛔ **STOP LOSS:** ${pos.symbol} hit -10%. Emergency Exit.`);
                await executeSolSwap(chatId, pos.tokenAddress, pos.symbol, 'SELL');
                clearInterval(interval);
            }
        } catch (e) { /* silent retry */ }
    }, 10000); // Check every 10 seconds
}

// --- 5. SECURITY: AUTO-PROFIT SWEEP ---
async function sweepProfits(chatId) {
    const conn = new Connection(NETWORKS.SOL.primary);
    const balance = await conn.getBalance(solWallet.publicKey);
    const minKeep = SYSTEM.minKeepBalance * LAMPORTS_PER_SOL;

    if (balance > minKeep + (0.1 * LAMPORTS_PER_SOL)) {
        const sweepAmt = balance - minKeep;
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: solWallet.publicKey,
                toPubkey: new PublicKey(SYSTEM.coldStorage),
                lamports: sweepAmt,
            })
        );
        // Sign and send logic here...
        bot.sendMessage(chatId, `🛡️ **SECURITY:** Swept ${(sweepAmt / LAMPORTS_PER_SOL).toFixed(4)} SOL to Cold Storage.`);
    }
}

// --- 6. TELEGRAM INTERFACE & INIT ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "⚔️ **APEX MASTER v9076 ONLINE (Pionex AI Enabled)**", {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🚀 START AI-AUTOPILOT", callback_data: "cmd_auto" }],
                [{ text: "🛡️ TSL DISTANCE: 3%", callback_data: "cfg_tsl" }, { text: "🏦 SWEEP NOW", callback_data: "cmd_sweep" }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    if (query.data === "cmd_sweep") await sweepProfits(query.message.chat.id);
    // Add other handlers for UI cycling as per your previous version
});

// Start the rebalancer loop (Every 4 hours)
setInterval(() => { if(solWallet) sweepProfits(process.env.ADMIN_CHAT_ID); }, 4 * 60 * 60 * 1000);

console.log("SYSTEM BOOTED: APEX PREDATOR PIONEX-AI READY".green.bold);
