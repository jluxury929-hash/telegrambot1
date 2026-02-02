/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (GLOBAL MASTER MERGE - FIXED)
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
const COLD_STORAGE = process.env.COLD_STORAGE_ADDRESS || "0xe75C82c976Ecc954bfFbbB2e7Fb94652C791bea5";
const MIN_SOL_KEEP = 0.05;

const NETWORKS = {
    SOL:  { id: 'solana', primary: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', sym: 'SOL' },
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', sym: 'ETH' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', sym: 'ETH' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: {}, atomicOn: true, flashOn: false,
    highestBalance: 0, isWaitingForDrop: false, jitoTip: 1000000 
};

let solWallet, evmWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. DASHBOARD UI ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount}`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `🕒 TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: SYSTEM.atomicOn ? "⚡ ATOMIC: ON" : "🛡️ ATOMIC: OFF", callback_data: "tg_atomic" }, { text: SYSTEM.flashOn ? "🔥 FLASH: ON" : "⚖️ FLASH: OFF", callback_data: "tg_flash" }],
            [{ text: solWallet ? "✅ WALLET LINKED" : "🔑 CONNECT WALLET", callback_data: "cmd_conn" }],
            [{ text: "💸 WITHDRAW PROFITS", callback_data: "cmd_withdraw" }]
        ]
    }
});

// --- 3. CORE EXECUTION: BUY/SELL ---

async function executeSolShotgun(chatId, addr, symbol) {
    try {
        const conn = new Connection(NETWORKS.SOL.primary, 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        
        // 1. Get Quote
        const qRes = await axios.get(`${JUP_API}/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${addr}&amount=${amt}&slippageBps=100`);
        
        // 2. Get Swap Transaction with Priority
        const sRes = await axios.post(`${JUP_API}/swap`, { 
            quoteResponse: qRes.data, 
            userPublicKey: solWallet.publicKey.toString(), 
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 100000
        });

        const tx = VersionedTransaction.deserialize(Buffer.from(sRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);

        // 3. Send via Jito or Standard
        let sig;
        if (SYSTEM.atomicOn) {
            const base64Tx = Buffer.from(tx.serialize()).toString('base64');
            const res = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]] });
            sig = res.data.result;
        } else {
            sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        }

        if (sig && chatId) bot.sendMessage(chatId, `✅ **BUY SUCCESS:** ${symbol}\nTX: \`${sig}\``, { parse_mode: 'Markdown' });
        return { success: !!sig };
    } catch (e) {
        console.log(`[BUY_ERROR] ${symbol}:`.red, e.message);
        return { success: false };
    }
}

async function executeSolSell(chatId, addr, symbol) {
    try {
        const conn = new Connection(NETWORKS.SOL.primary, 'confirmed');
        const tokenPublicKey = new PublicKey(addr);
        
        // Find balance
        const accounts = await conn.getParsedTokenAccountsByOwner(solWallet.publicKey, { mint: tokenPublicKey });
        const amount = accounts.value[0]?.account.data.parsed.info.tokenAmount.amount;

        if (!amount || amount === "0") return { success: false };

        const qRes = await axios.get(`${JUP_API}/quote?inputMint=${addr}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=200`);
        const sRes = await axios.post(`${JUP_API}/swap`, { quoteResponse: qRes.data, userPublicKey: solWallet.publicKey.toString() });

        const tx = VersionedTransaction.deserialize(Buffer.from(sRes.data.swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });

        if (chatId) bot.sendMessage(chatId, `🚨 **SELL EXECUTED:** ${symbol}\n[Solscan](https://solscan.io/tx/${sig})`, { parse_mode: 'Markdown' });
        return { success: true };
    } catch (e) {
        console.log(`[SELL_ERROR] ${symbol}:`.red, e.message);
        return { success: false };
    }
}

// --- 4. MONITORING & BRAIN ---

async function startIndependentPeakMonitor(chatId, netKey, pos) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
        const pair = res.data.pairs?.[0];
        const curPrice = parseFloat(pair?.priceUsd) || 0;
        const entry = parseFloat(pos.entryPrice) || 0.00000001;
        const pnl = ((curPrice - entry) / entry) * 100;

        let tp = 25, sl = -10;
        if (SYSTEM.risk === 'LOW') { tp = 15; sl = -7; }
        if (SYSTEM.risk === 'MAX') { tp = 100; sl = -25; }

        if (pnl >= tp || pnl <= sl) {
            bot.sendMessage(chatId, `🎯 **PNL TARGET:** ${pos.symbol} at ${pnl.toFixed(2)}%. Exiting...`);
            if (netKey === 'SOL') await executeSolSell(chatId, pos.tokenAddress, pos.symbol);
            delete SYSTEM.lastTradedTokens[pos.tokenAddress];
        } else {
            setTimeout(() => startIndependentPeakMonitor(chatId, netKey, pos), 10000);
        }
    } catch (e) {
        setTimeout(() => startIndependentPeakMonitor(chatId, netKey, pos), 15000);
    }
}

async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress) {
                    const ready = await verifyBalance(netKey);
                    if (!ready) { 
                        bot.sendMessage(chatId, `⚠️ Low Balance for ${netKey}`);
                        await new Promise(r => setTimeout(r, 60000));
                        continue;
                    }

                    SYSTEM.isLocked[netKey] = true;
                    bot.sendMessage(chatId, `🧠 **[${netKey}] SIGNAL:** ${signal.symbol}. RugChecking...`);
                    
                    const safe = await verifySignalSafety(signal.tokenAddress);
                    if (safe) {
                        const buyRes = await executeSolShotgun(chatId, signal.tokenAddress, signal.symbol);
                        if (buyRes && buyRes.success) {
                            SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                            startIndependentPeakMonitor(chatId, netKey, { ...signal, entryPrice: signal.price });
                        }
                    }
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 10000)); }
    }
}

// --- 5. UTILS ---

async function runNeuralSignalScan(netKey) {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const chainMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base' };
        const match = res.data.find(t => t.chainId === chainMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol || "UNK", tokenAddress: match.tokenAddress, price: parseFloat(match.amount) || 0.001 } : null;
    } catch (e) { return null; }
}

async function verifySignalSafety(addr) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${addr}/report`);
        return res.data.score < 600; 
    } catch (e) { return true; } 
}

async function verifyBalance(net) {
    if (net !== 'SOL' || !solWallet) return true;
    const conn = new Connection(NETWORKS.SOL.primary);
    const bal = await conn.getBalance(solWallet.publicKey);
    return bal > (parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
}

// --- 6. TELEGRAM HANDLERS ---

bot.on('callback_query', async (query) => {
    const { data, message } = query;
    const chatId = message.chat.id;

    if (data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "❌ Connect wallet first.");
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, "🚀 **AUTO-PILOT ACTIVATED.** Scanners online.");
            startNetworkSniper(chatId, 'SOL');
        }
    } else if (data === "cycle_amt") {
        const amts = ["0.1", "0.5", "1.0", "2.0"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    } else if (data === "cmd_status") {
        const conn = new Connection(NETWORKS.SOL.primary);
        const bal = solWallet ? (await conn.getBalance(solWallet.publicKey) / 1e9).toFixed(3) : "0";
        bot.sendMessage(chatId, `📊 **SYSTEM STATUS**\nBalance: ${bal} SOL\nAutoPilot: ${SYSTEM.autoPilot}\nRisk: ${SYSTEM.risk}`);
    } else if (data === "cmd_conn") {
        bot.sendMessage(chatId, "🔑 Send: `/connect [mnemonic phrase]`");
    }

    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: message.message_id }).catch(() => {});
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = match[1].trim();
        const hex = (await bip39.mnemonicToSeed(seed)).toString('hex');
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        bot.sendMessage(msg.chat.id, `✅ **SYNCED:** \`${solWallet.publicKey.toString()}\``, getDashboardMarkup());
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ SYNC FAILED."); }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🤖 **APEX MASTER v9076 ONLINE**", getDashboardMarkup()));

http.createServer((req, res) => res.end("SYSTEM LIVE")).listen(process.env.PORT || 8080);
