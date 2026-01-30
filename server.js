/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (GLOBAL ULTIMATUM EDITION)
 * Integrated with: Price Gap Protection & Auto-Sweep Vault
 * ===============================================================================
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { ethers, JsonRpcProvider } = require('ethers');
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { default: Client } = require("@triton-one/yellowstone-grpc"); 
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const WebSocket = require('ws');
const http = require('http');
require('colors');

// 1. INITIALIZE BOT
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// 2. GLOBAL STATE & CONFIG
const JUP_API = "https://quote-api.jup.ag/v6";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const BINANCE_WS = "wss://stream.binance.com:9443/ws/solusdt@bookTicker";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};

const NETWORKS = {
    SOL:  { id: 'solana', endpoints: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana'], sym: 'SOL' },
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', sym: 'ETH' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', sym: 'ETH' }
};

let SYSTEM = {
    autoPilot: false,
    tradeAmount: "0.1", 
    risk: 'MAX',
    mode: 'SHORT',
    atomicOn: true,
    flashOn: false,
    jitoTip: 20000000, // 0.02 SOL
    lastBinancePrice: 0,
    isLocked: {},
    lastTradedTokens: {},
    // --- PROTECTION CONFIG ---
    maxPriceGap: 1.5,       // Max % diff allowed between Binance/DEX
    autoSweepEnabled: true,
    profitThreshold: 0.5,   // Sweep if balance > 0.5 SOL
    vaultAddress: process.env.VAULT_ADDRESS || "" // Set in .env
};

let solWallet, evmWallet, activeChatId;

// --- 🔱 LAYER 1: MEV-SHIELD (JITO BUNDLER) ---
const originalSend = Connection.prototype.sendRawTransaction;
Connection.prototype.sendRawTransaction = async function(rawTx, options) {
    try {
        const base64Tx = Buffer.from(rawTx).toString('base64');
        const jitoRes = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]]
        });
        if (jitoRes.data.result) return jitoRes.data.result;
    } catch (e) { console.log(`[MEV-SHIELD] Private Lane busy...`.yellow); }
    return originalSend.apply(this, [rawTx, options]);
};

// --- 🔱 LAYER 2: PROTECTION & UTILS ---

async function autoSweepProfits(chatId) {
    if (!SYSTEM.autoSweepEnabled || !solWallet || !SYSTEM.vaultAddress) return;
    try {
        const conn = new Connection(NETWORKS.SOL.endpoints[0], 'confirmed');
        const balance = await conn.getBalance(solWallet.publicKey);
        const threshold = SYSTEM.profitThreshold * LAMPORTS_PER_SOL;

        if (balance > threshold) {
            const sweepAmount = balance - (parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL) - 10000000;
            if (sweepAmount <= 5000000) return;

            const tx = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: solWallet.publicKey,
                    toPubkey: new PublicKey(SYSTEM.vaultAddress),
                    lamports: sweepAmount
                })
            );
            const sig = await conn.sendTransaction(tx, [solWallet]);
            bot.sendMessage(chatId, `🏦 <b>AUTO-SWEEP:</b> ${(sweepAmount/LAMPORTS_PER_SOL).toFixed(4)} SOL moved to Vault.`, { parse_mode: 'HTML' });
        }
    } catch (e) { console.log("[SWEEP] Error during profit extraction".red); }
}

async function verifySignalIntegrity(tokenAddress) {
    try {
        const rugReport = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`, SCAN_HEADERS);
        const risks = rugReport.data?.risks || [];
        return !risks.some(r => r.level === 'danger' || r.name === 'Mint Authority');
    } catch (e) { return false; }
}

// --- 🔱 LAYER 3: EXECUTION ENGINE ---

async function executeAggressiveSolRotation(chatId, targetToken, symbol) {
    try {
        const conn = new Connection(NETWORKS.SOL.endpoints[0], 'confirmed');
        
        // 1. PRICE GAP PROTECTION Check
        const solanaPriceRes = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000`);
        const solanaPrice = solanaPriceRes.data.outAmount / 1e6;
        const gap = Math.abs(((SYSTEM.lastBinancePrice - solanaPrice) / solanaPrice) * 100);

        if (gap > SYSTEM.maxPriceGap) {
            console.log(`[GAP GUARD] Blocked: ${gap.toFixed(2)}% gap detected.`.red);
            return false;
        }

        // 2. EXECUTE SWAP
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        const quote = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${targetToken}&amount=${amt}&slippageBps=100`);
        
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
            bot.sendMessage(chatId, `💰 <b>SUCCESS:</b> ${symbol} Trade Executed.`);
            setTimeout(() => autoSweepProfits(chatId), 5000);
            return true;
        }
    } catch (e) { console.log(`[EXECUTION] Failed: ${e.message}`.red); return false; }
}

// --- 🔱 LAYER 4: TELEGRAM INTERFACE ---

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO" : "🚀 START AUTO", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: "🔌 CONNECT", callback_data: "cmd_conn" }, { text: "🏦 WITHDRAW", callback_data: "cmd_withdraw" }]
        ]
    }
});

bot.on('callback_query', async (query) => {
    const { data, message } = query;
    const chatId = message.chat.id;

    if (data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ Connect wallet first.");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startNetworkSniper(chatId);
    } else if (data === "cmd_status") {
        const solanaPriceRes = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000000`);
        const solPrice = solanaPriceRes.data.outAmount / 1e6;
        bot.sendMessage(chatId, `🛰️ <b>RADAR STATUS</b>\n\nBinance: $${SYSTEM.lastBinancePrice.toFixed(2)}\nDEX: $${solPrice.toFixed(2)}\nGap: ${Math.abs(((SYSTEM.lastBinancePrice-solPrice)/solPrice)*100).toFixed(2)}%`, { parse_mode: 'HTML' });
    }
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: message.message_id }).catch(() => {});
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = await bip39.mnemonicToSeed(match[1].trim());
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key);
        bot.sendMessage(msg.chat.id, `✅ <b>SYNCED:</b> <code>${solWallet.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
        bot.deleteMessage(msg.chat.id, msg.message_id); // Security: Delete mnemonic
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Invalid Mnemonic"); }
});

// --- 🔱 LAYER 5: MAIN LOOPS ---

async function startNetworkSniper(chatId) {
    const ws = new WebSocket(BINANCE_WS);
    ws.on('message', (data) => {
        const tick = JSON.parse(data);
        SYSTEM.lastBinancePrice = (parseFloat(tick.b) + parseFloat(tick.a)) / 2;
    });

    while (SYSTEM.autoPilot) {
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const token = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
            
            if (token && await verifySignalIntegrity(token.tokenAddress)) {
                await executeAggressiveSolRotation(chatId, token.tokenAddress, token.symbol);
                SYSTEM.lastTradedTokens[token.tokenAddress] = true;
            }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 5000));
    }
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>⚔️ APEX OMNI-MASTER v9076</b>\nMulti-Chain Radar Active.", { parse_mode: 'HTML', ...getDashboardMarkup() });
});

http.createServer((req, res) => res.end("v9076 ACTIVE")).listen(8080);
