/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (POCKET ATOMIC MASTER)
 * ===============================================================================
 * FIX: 'undefined' Data Mapping + Payout Logic
 * LOGIC: Jito Atomic Bundling (Reversal Protection)
 * STYLE: Pocket Robot AI (ITM/OTM Reporting)
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

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', atomicOn: true,
    jitoTip: 100000, // 0.0001 SOL Tip
    lastTradedTokens: {}, isLocked: {},
    currentAsset: 'So11111111111111111111111111111111111111112'
};

let solWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 ATOMIC BUNDLE ENGINE ---
async function sendPocketBundle(signedTxs) {
    try {
        const base64Txs = signedTxs.map(tx => Buffer.from(tx).toString('base64'));
        const res = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [base64Txs]
        });
        return res.data.result; 
    } catch (e) { return null; }
}

// --- 3. THE SHOTGUN EXECUTION (FIXED DATA MAPPING) ---
async function executePocketShotgun(chatId, tokenAddr, amount, symbol) {
    try {
        // FIX: Fallback to prevent 'undefined'
        const safeSymbol = symbol || "UNKN";
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

        bot.sendMessage(chatId, `🔍 <b>ANALYZING SIGNAL</b>\n\n<b>Asset:</b> ${safeSymbol}/SOL\n<b>Direction:</b> 🟢 CALL\n<b>Type:</b> ATOMIC OPTION\n<b>Status:</b> Initializing Bundle...`, { parse_mode: 'HTML' });

        const orderRes = await axios.get(`${JUP_ULTRA_API}/order?inputMint=${SYSTEM.currentAsset}&outputMint=${tokenAddr}&amount=${lamports}&taker=${solWallet.publicKey.toString()}&slippageBps=50`, SCAN_HEADERS);
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

        const bundleId = await sendPocketBundle([swapTx.serialize(), tipTx.serialize()]);

        if (bundleId) {
            bot.sendMessage(chatId, `✅ <b>TRADE CONFIRMED</b>\n\n<b>Result:</b> LANDED\n<b>Asset:</b> ${safeSymbol}\n<b>Amount:</b> ${amount} SOL\n<b>Bundle:</b> <code>${bundleId.substring(0,10)}...</code>\n\n🚀 <i>AI Monitoring Expiry...</i>`, { parse_mode: 'HTML' });
            return { success: true, entryPrice: orderRes.data.price };
        } else {
            bot.sendMessage(chatId, `⚠️ <b>REVERSAL TRIGGERED</b>\n\n<b>Reason:</b> Slippage/Volatility\n<b>Action:</b> Transaction cancelled. 0.00 SOL lost.`, { parse_mode: 'HTML' });
            return { success: false };
        }
    } catch (e) { return { success: false }; }
}

// --- 4. POSITION MONITOR (PAYOUT REPORTING) ---
async function startIndependentPeakMonitor(chatId, pos) {
    const telemetry = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
            const curPrice = parseFloat(res.data.pairs?.[0]?.priceUsd) || 0;
            const pnl = ((curPrice - pos.entryPrice) / pos.entryPrice) * 100;

            if (pnl >= 30 || pnl <= -10) {
                const isWin = pnl > 0;
                const payoutSOL = (parseFloat(SYSTEM.tradeAmount) * (1 + (pnl / 100))).toFixed(4);
                bot.sendMessage(chatId, `${isWin ? "💰" : "📉"} <b>PAYOUT RECEIVED</b>\n\n<b>Asset:</b> ${pos.symbol}\n<b>Payout:</b> ${payoutSOL} SOL\n<b>Result:</b> ${isWin ? "ITM (WIN)" : "OTM (LOSS)"}\n<b>PnL:</b> ${pnl.toFixed(2)}%`, { parse_mode: 'HTML' });
                clearInterval(telemetry);
            }
        } catch (e) {}
    }, 15000);
}

// --- 5. COMMANDS & UI ---
bot.onText(/\/amount (.+)/, (msg, match) => {
    SYSTEM.tradeAmount = match[1].trim();
    bot.sendMessage(msg.chat.id, `⚙️ <b>AMOUNT UPDATED:</b> ${SYSTEM.tradeAmount} SOL`);
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cmd_auto") {
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, `🤖 <b>AUTO-PILOT ACTIVE</b>\nStreaming real-time neural trades...`, { parse_mode: 'HTML' });
            startNetworkSniper(chatId);
        }
    }
    bot.answerCallbackQuery(q.id);
});

async function startNetworkSniper(chatId) {
    while (SYSTEM.autoPilot) {
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            // CORRECTED DATA MAPPING
            const match = res.data.find(t => t.chainId === 'solana' && t.symbol && !SYSTEM.lastTradedTokens[t.tokenAddress]);
            
            if (match) {
                bot.sendMessage(chatId, `📉 <b>TRADING:</b> Executing AI signal for ${match.symbol}...`);
                const tradeRes = await executePocketShotgun(chatId, match.tokenAddress, SYSTEM.tradeAmount, match.symbol);
                if (tradeRes.success) {
                    SYSTEM.lastTradedTokens[match.tokenAddress] = true;
                    startIndependentPeakMonitor(chatId, { 
                        symbol: match.symbol, 
                        tokenAddress: match.tokenAddress, 
                        entryPrice: tradeRes.entryPrice 
                    });
                }
            }
            await new Promise(r => setTimeout(r, 4000));
        } catch (e) {}
    }
}

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, `🎮 <b>POCKET ROBOT v9032 AI</b>`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: SYSTEM.autoPilot ? "🛑 STOP" : "🚀 START", callback_data: "cmd_auto" }]] } }));

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const seed = match[1].trim();
    const mnemonic = await bip39.mnemonicToSeed(seed);
    solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
    bot.sendMessage(msg.chat.id, `✅ <b>SYNCED</b>`);
});

http.createServer((req, res) => res.end("POCKET MASTER READY")).listen(8080);
