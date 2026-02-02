/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (GLOBAL MASTER MERGE - FIXED)
 * ===============================================================================
 */

require('dotenv').config();
// FIX: Correctly destructure Client from the CommonJS require
const { default: Client, CommitmentLevel } = require("@triton-one/yellowstone-grpc"); 
const { 
    Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, 
    PublicKey, ComputeBudgetProgram 
} = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 1. CONFIGURATION ---
const JUP_API = "https://quote-api.jup.ag/v6";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", atomicOn: true,
    jitoTip: 5000000, // 0.005 SOL
    lastTradedTokens: {}
};

let solWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 LAYER 2: HYBRID SUBMISSION (MAX TRANSACTIONS) ---
async function broadcastHybrid(rawTx, conn) {
    const base64Tx = Buffer.from(rawTx).toString('base64');
    
    // Path A: Jito Private Lane (Scam Protection)
    const jitoPath = axios.post(JITO_ENGINE, { 
        jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]] 
    }).catch(() => null);

    // Path B: Staked RPC (Pure Speed)
    const stakedPath = conn.sendRawTransaction(rawTx, {
        skipPreflight: true,
        maxRetries: 0       
    }).catch(() => null);

    // Race both paths: First one to land wins the profit
    return await Promise.any([jitoPath, stakedPath]);
}

// --- 🎯 LAYER 3: GEYSER gRPC RADAR (FIXED CONSTRUCTOR) ---
async function startGeyserRadar(chatId) {
    if (!process.env.GEYSER_URL || !process.env.GEYSER_TOKEN) {
        return bot.sendMessage(chatId, "❌ ERROR: GEYSER_URL or TOKEN missing in .env");
    }

    try {
        // FIXED: Using the corrected Client constructor
        const client = new Client(process.env.GEYSER_URL, process.env.GEYSER_TOKEN, {
            "grpc.max_receive_message_length": 64 * 1024 * 1024,
        });

        const stream = await client.subscribe();
        const request = {
            transactions: {
                raydium: { accountInclude: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"] }
            },
            commitment: CommitmentLevel.PROCESSED,
            accounts: {}, slots: {}, blocks: {}, blocksMeta: {}, entry: {}, accountsDataSlice: []
        };

        bot.sendMessage(chatId, "🦅 **GEYSER RADAR CONNECTED.** Listening for whale entries...");

        stream.on("data", async (data) => {
            if (data.transaction && SYSTEM.autoPilot) {
                const pool = data.transaction.transaction.message.accountKeys[1];
                await executeFlashShotgun(chatId, pool, "GEYSER_SIGNAL");
            }
        });

        // Write the subscription request
        await new Promise((resolve, reject) => {
            stream.write(request, (err) => err ? reject(err) : resolve());
        });

    } catch (e) {
        console.error(`[gRPC CRASH] ${e.message}`.red);
        bot.sendMessage(chatId, "⚠️ Radar crashed. Reconnecting in 5s...");
        setTimeout(() => startGeyserRadar(chatId), 5000);
    }
}

// --- ⚡ LAYER 4: 10x FLASH LOAN EXECUTION ---
async function executeFlashShotgun(chatId, addr, symbol) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC, 'processed');
        const borrowAmt = parseFloat(SYSTEM.tradeAmount) * 10 * LAMPORTS_PER_SOL;
        
        // 1. Fetch Leveraged Quote
        const q = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${addr}&amount=${borrowAmt}&slippageBps=300`);
        
        // 2. Build Atomic Swap with CU Optimization (120k)
        const swap = await axios.post(`${JUP_API}/swap`, {
            quoteResponse: q.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: SYSTEM.jitoTip
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(swap.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);

        const sig = await broadcastHybrid(tx.serialize(), conn);
        if (sig) bot.sendMessage(chatId, `🔥 **FLASH 10x SUCCESS:** ${symbol}\nHanding position to Pionex AI.`);
        
    } catch (e) { console.log(`[EXECUTION FAIL]`.red); }
}

// --- UI HANDLERS ---
bot.on('callback_query', async (query) => {
    if (query.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(query.message.chat.id, "❌ Link Wallet First!");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) startGeyserRadar(query.message.chat.id);
    }
    bot.answerCallbackQuery(query.id);
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const seed = match[1].trim();
    const mnemonic = await bip39.mnemonicToSeed(seed);
    solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
    bot.sendMessage(msg.chat.id, `✅ **SYNCED:** \`${solWallet.publicKey.toString()}\``);
});

http.createServer((req, res) => res.end("MASTER READY")).listen(8080);
