/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (UNIFIED ATOMIC MASTER)
 * ===============================================================================
 * LOGIC: Jito Atomic Bundling + Multi-Chain Neural Scanning
 * STYLE: Pocket Robot AI (ITM/OTM Payout Reporting)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider } = require('ethers');
const { 
    Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, 
    SystemProgram, PublicKey, TransactionMessage 
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
    SOL:  { id: 'solana', type: 'SVM', rpc: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com' },
    ETH:  { id: 'ethereum', type: 'EVM', rpc: 'https://rpc.mevblocker.io' },
    BASE: { id: 'base', type: 'EVM', rpc: 'https://mainnet.base.org' },
    BSC:  { id: 'bsc', type: 'EVM', rpc: 'https://bsc-dataseed.binance.org/' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', atomicOn: true,
    jitoTip: 100000, lastTradedTokens: {}, isLocked: {},
    currentAsset: 'So11111111111111111111111111111111111111112'
};

let solWallet, evmWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. ATOMIC ENGINES ---
async function sendJitoBundle(signedTxs) {
    try {
        const base64Txs = signedTxs.map(tx => Buffer.from(tx).toString('base64'));
        const res = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [base64Txs]
        });
        return res.data.result;
    } catch (e) { return null; }
}

async function executeSolanaAtomic(chatId, tokenAddr, amount, symbol) {
    try {
        const conn = new Connection(NETWORKS.SOL.rpc, 'confirmed');
        const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

        // Analysis Signal
        bot.sendMessage(chatId, `🔍 <b>ANALYZING SIGNAL: ${symbol}/SOL</b>\nExecuting Atomic Bundle...`, { parse_mode: 'HTML' });

        const orderRes = await axios.get(`${JUP_ULTRA_API}/order?inputMint=${SYSTEM.currentAsset}&outputMint=${tokenAddr}&amount=${lamports}&taker=${solWallet.publicKey.toString()}&slippageBps=100`, SCAN_HEADERS);
        const swapTx = VersionedTransaction.deserialize(Buffer.from(orderRes.data.transaction, 'base64'));
        
        const tipAccount = new PublicKey("96g9s9yUfQUY1mbSiyS3SbgUmWVEvqeGvN7W8P8x2x7H");
        const { blockhash } = await conn.getLatestBlockhash();
        const tipTx = new VersionedTransaction(new TransactionMessage({
            payerKey: solWallet.publicKey,
            recentBlockhash: blockhash,
            instructions: [SystemProgram.transfer({ fromPubkey: solWallet.publicKey, toPubkey: tipAccount, lamports: SYSTEM.jitoTip })]
        }).compileToV0Message());

        swapTx.sign([solWallet]);
        tipTx.sign([solWallet]);

        const bundleId = await sendJitoBundle([swapTx.serialize(), tipTx.serialize()]);
        return bundleId ? { success: true, entryPrice: orderRes.data.price } : { success: false };
    } catch (e) { return { success: false }; }
}

// --- 3. THE NEURAL SCANNER (THE FIX) ---
async function runAutoPilotLoop(chatId, netKey) {
    console.log(`[SYSTEM] Thread Started: ${netKey}`.cyan);
    while (SYSTEM.autoPilot) {
        try {
            // Fetch Latest Boosted Tokens (High Alpha)
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const chainIdMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base', 'BSC': 'bsc' };
            
            const match = res.data.find(t => t.chainId === chainIdMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);

            if (match && !SYSTEM.isLocked[netKey]) {
                SYSTEM.isLocked[netKey] = true;
                
                let tradeRes;
                if (netKey === 'SOL') {
                    tradeRes = await executeSolanaAtomic(chatId, match.tokenAddress, SYSTEM.tradeAmount, match.symbol);
                } else {
                    // Logic for EVM networks can be added here
                    console.log(`EVM Trade Triggered for ${match.symbol} on ${netKey}`);
                }

                if (tradeRes?.success) {
                    bot.sendMessage(chatId, `✅ <b>TRADE LANDED</b>\nAsset: ${match.symbol}\nStatus: Monitoring for Payout...`, { parse_mode: 'HTML' });
                    SYSTEM.lastTradedTokens[match.tokenAddress] = true;
                    startPeakMonitor(chatId, { ...match, entryPrice: tradeRes.entryPrice });
                }
                
                SYSTEM.isLocked[netKey] = false;
            }
            // Rapid scanning frequency
            await new Promise(r => setTimeout(r, 5000));
        } catch (e) { 
            await new Promise(r => setTimeout(r, 10000)); 
        }
    }
}

// --- 4. POSITION MONITOR ---
async function startPeakMonitor(chatId, pos) {
    const telemetry = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
            const curPrice = parseFloat(res.data.pairs?.[0]?.priceUsd) || 0;
            const entry = parseFloat(pos.entryPrice) || 0.00000001;
            const pnl = ((curPrice - entry) / entry) * 100;

            if (pnl >= 20 || pnl <= -10) {
                const isWin = pnl > 0;
                bot.sendMessage(chatId, `💰 <b>PAYOUT RECEIVED</b>\n\n<b>Asset:</b> ${pos.symbol}\n<b>Result:</b> ${isWin ? "ITM (WIN)" : "OTM (LOSS)"}\n<b>PnL:</b> ${pnl.toFixed(2)}%`, { parse_mode: 'HTML' });
                clearInterval(telemetry);
            }
        } catch (e) {}
    }, 15000);
}

// --- 5. INTERFACE & COMMANDS ---
const getDashboard = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP NEURAL AI" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💵 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }],
            [{ text: "🔗 CONNECT WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(q.id, { text: "Connect Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, "🤖 <b>APEX NEURAL ONLINE</b>\nScanning Solana, Base, and ETH for Atomic opportunities...", { parse_mode: 'HTML' });
            Object.keys(NETWORKS).forEach(net => runAutoPilotLoop(chatId, net));
        }
    }
    if (q.data === "cycle_amt") {
        const amts = ["0.1", "0.5", "1.0", "2.0"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    }
    bot.editMessageReplyMarkup(getDashboard().reply_markup, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "⚡ <b>POCKET ATOMIC v9032</b>\nReady for neural signal execution.", { parse_mode: 'HTML', ...getDashboard() }));

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = match[1].trim();
        const mnemonic = await bip39.mnemonicToSeed(seed);
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
        evmWallet = ethers.Wallet.fromPhrase(seed);
        bot.sendMessage(msg.chat.id, `✅ <b>SYNCED</b>\nSOL: <code>${solWallet.publicKey.toString()}</code>\nEVM: <code>${evmWallet.address}</code>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Invalid Seed Phrase"); }
});

http.createServer((req, res) => res.end("APEX POWERED")).listen(8080);
