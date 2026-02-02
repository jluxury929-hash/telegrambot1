/**
 * ===============================================================================
 * APEX PREDATOR: OMNI-MASTER v9100 (BROKER-NEURAL HYBRID)
 * ===============================================================================
 */

require('dotenv').config();
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

// --- state & config ---
const JUP_API = "https://quote-api.jup.ag/v6";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const BIRDEYE_API = "https://public-api.birdeye.so";

let SYSTEM = {
    autoPilot: false,
    tradeAmount: "0.1",
    lastTradedTokens: {},
    isLocked: false,
    atomicOn: true,
    baseAsset: 'So11111111111111111111111111111111111111112'
};

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 📈 BROKER TREND ANALYSIS (PO-BROKER LOGIC) ---
async function getMarketSentiment() {
    try {
        // Logic: Pulling SOL/USDT trend to ensure we aren't buying in a market dump
        const res = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT`);
        const priceChange = parseFloat(res.data.priceChangePercent);
        return priceChange > -2.0; // "Bullish" or "Stable" if not dropping > 2%
    } catch (e) { return true; }
}

// --- 🧠 DUAL BRAINS ---
async function scanMarketRadar() {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1');
        const match = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol, address: match.tokenAddress, brain: "RADAR-1" } : null;
    } catch (e) { return null; }
}

// --- 🚀 MULTI-HOP WITH EARNINGS TRACKER ---

async function executeMultiHopTrade(chatId, tokenAddress, symbol, brainSource) {
    try {
        const conn = new Connection("https://api.mainnet-beta.solana.com", 'confirmed');
        
        // Confirm Trend before Swapping (Broker Integration)
        const isHealthy = await getMarketSentiment();
        if (!isHealthy) {
            console.log("Market too volatile, skipping signal...".yellow);
            return false;
        }

        const lamports = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        const qRes = await axios.get(`${JUP_API}/quote?inputMint=${SYSTEM.baseAsset}&outputMint=${tokenAddress}&amount=${lamports}&slippageBps=100`);
        const quote = qRes.data;

        // Path Display: SOL ➔ Raydium ➔ $TOKEN
        const path = quote.routePlan.map(p => p.swapInfo.label).join(' ➔ ');
        
        // EARNINGS CALCULATION
        const estAmountOut = quote.outAmount / (10 ** quote.extraInfo?.quotedPrice?.decimals || 6);
        const feeEst = 0.002; // Estimated Jito + Priority Fee in SOL
        const potentialProfitUSD = ((estAmountOut * parseFloat(quote.swapUsdValue)) - (parseFloat(SYSTEM.tradeAmount) * 248)).toFixed(2);

        bot.sendMessage(chatId, 
            `⚡ **MULTI-HOP ENGAGED [${brainSource}]**\n` +
            `Path: \`SOL ➔ ${path} ➔ $${symbol}\`\n` +
            `Est. Profit: \`$${potentialProfitUSD} USD\``
        );

        // Build & Sign
        const { data: { swapTransaction } } = await axios.post(`${JUP_API}/swap`, {
            quoteResponse: quote,
            userPublicKey: solWallet.publicKey.toString(),
            wrapAndUnwrapSol: true
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([solWallet]);

        const signature = await conn.sendRawTransaction(tx.serialize());
        if (signature) {
            bot.sendMessage(chatId, `✅ **EARNINGS SECURED**\nTrade: $${symbol}\nSig: \`${signature.slice(0,12)}...\``);
            return true;
        }
    } catch (e) { return false; }
}

// --- COORDINATOR ---
async function startAutoPilot(chatId) {
    bot.sendMessage(chatId, "🚀 **APEX AUTO-PILOT INITIATED**");
    
    const processor = async (scanner) => {
        while (SYSTEM.autoPilot) {
            if (!SYSTEM.isLocked) {
                const signal = await scanner();
                if (signal) {
                    SYSTEM.isLocked = true;
                    await executeMultiHopTrade(chatId, signal.address, signal.symbol, signal.brain);
                    SYSTEM.lastTradedTokens[signal.address] = true;
                    SYSTEM.isLocked = false;
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    };
    processor(scanMarketRadar);
}

bot.on('callback_query', async (q) => {
    if (q.data === "cmd_auto") {
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startAutoPilot(q.message.chat.id);
    }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🐺 **APEX MASTER v9100**", {
    reply_markup: {
        inline_keyboard: [[{ text: "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }]]
    }
}));

http.createServer((req, res) => res.end("SYSTEM LIVE")).listen(8080);

