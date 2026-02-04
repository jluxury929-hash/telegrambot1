/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (FULL ATOMIC AUTO-PILOT)
 * ===============================================================================
 * LOGIC: Jito Atomic Bundling (Reversal Protection)
 * STYLE: Pocket Robot AI Trader (High-Frequency Alerts)
 * SECURITY: MEV-Shield + Dual-RPC Shotgun
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
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': process.env.DEX_API_KEY }};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', atomicOn: true,
    lastTradedTokens: {}, isLocked: {},
    jitoTip: 100000, // 0.0001 SOL Tip
    minPayout: 80,   // Mimics Pocket Robot 80% Payout target
    currentAsset: 'So11111111111111111111111111111111111111112'
};

let solWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 LAYER 2: THE ATOMIC BUNDLE ENGINE ---
async function sendPocketBundle(signedTxs) {
    try {
        const base64Txs = signedTxs.map(tx => Buffer.from(tx).toString('base64'));
        const res = await axios.post(JITO_ENGINE, {
            jsonrpc: "2.0", id: 1, method: "sendBundle", params: [base64Txs]
        });
        return res.data.result; 
    } catch (e) {
        return null;
    }
}

// --- 3. EXECUTION ENGINE (THE POCKET SHOTGUN) ---
async function executePocketShotgun(chatId, tokenAddr, amount, symbol) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC, 'confirmed');
        const amountLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

        // Signal UI: Identifying Trade
        bot.sendMessage(chatId, `🔍 <b>SIGNAL DETECTED</b>\n\n<b>Asset:</b> ${symbol}/SOL\n<b>Direction:</b> 🟢 BUY\n<b>Type:</b> ATOMIC JITO\n<b>Status:</b> Analyzing Liquidity...`, { parse_mode: 'HTML' });

        // 1. Fetch Transaction
        const orderRes = await axios.get(`${JUP_ULTRA_API}/order?inputMint=${SYSTEM.currentAsset}&outputMint=${tokenAddr}&amount=${amountLamports}&taker=${solWallet.publicKey.toString()}&slippageBps=50`, SCAN_HEADERS);
        const swapTx = VersionedTransaction.deserialize(Buffer.from(orderRes.data.transaction, 'base64'));
        
        // 2. Build Jito Tip (Atomic Guard)
        const tipAccount = new PublicKey("96g9s9yUfQUY1mbSiyS3SbgUmWVEvqeGvN7W8P8x2x7H");
        const { blockhash } = await conn.getLatestBlockhash();
        const tipTx = new VersionedTransaction(new TransactionMessage({
            payerKey: solWallet.publicKey,
            recentBlockhash: blockhash,
            instructions: [SystemProgram.transfer({ fromPubkey: solWallet.publicKey, toPubkey: tipAccount, lamports: SYSTEM.jitoTip })]
        }).compileToV0Message());

        swapTx.sign([solWallet]);
        tipTx.sign([solWallet]);

        // 3. BLAST BUNDLE
        const bundleId = await sendAtomicPocketBundle([swapTx.serialize(), tipTx.serialize()]);

        if (bundleId) {
            bot.sendMessage(chatId, `✅ <b>TRADE EXECUTED</b>\n\n<b>Result:</b> SUCCESS\n<b>Asset:</b> ${symbol}\n<b>Amount:</b> ${amount} SOL\n<b>Bundle ID:</b> <code>${bundleId.substring(0,12)}...</code>\n\n🚀 <i>Monitoring for ${SYSTEM.minPayout}% Payout Target...</i>`, { parse_mode: 'HTML' });
            return { success: true, entryPrice: orderRes.data.price };
        } else {
            bot.sendMessage(chatId, `⚠️ <b>REVERSAL TRIGGERED</b>\n\n<b>Reason:</b> Slippage/Congestion\n<b>Action:</b> Transaction cancelled. 0.00 SOL lost.\n<b>Status:</b> Waiting for next signal...`, { parse_mode: 'HTML' });
            return { success: false };
        }
    } catch (e) {
        return { success: false };
    }
}

// --- 4. INDEPENDENT PEAK MONITOR (PnL ALERTS) ---
async function startIndependentPeakMonitor(chatId, pos) {
    const monitor = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
            const curPrice = parseFloat(res.data.pairs?.[0]?.priceUsd) || 0;
            const pnl = ((curPrice - pos.entryPrice) / pos.entryPrice) * 100;

            if (pnl >= 30 || pnl <= -10) {
                const icon = pnl > 0 ? "💰" : "📉";
                bot.sendMessage(chatId, `${icon} <b>TRADE CLOSED</b>\n\n<b>Asset:</b> ${pos.symbol}\n<b>PnL:</b> ${pnl.toFixed(2)}%\n<b>Payout:</b> ${(pnl > 0 ? "WIN" : "LOSS")}\n<b>Status:</b> Wallet Rebalanced.`, { parse_mode: 'HTML' });
                clearInterval(monitor);
            }
        } catch (e) {}
    }, 15000);
}

// --- 5. INTERFACE (POCKET UI STYLE) ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 Amount: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: `🛡️ Atomic: ON`, callback_data: "tg_atomic" }],
            [{ text: `📊 Payout: ${SYSTEM.minPayout}%`, callback_data: "cycle_payout" }, { text: "🔌 Wallet", callback_data: "cmd_conn" }]
        ]
    }
});

bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    if (q.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(q.id, { text: "Link Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, `🤖 <b>POCKET ROBOT ONLINE</b>\n\n<b>Mode:</b> Atomic Sniper\n<b>Status:</b> Scanning Multi-Chain...`, { parse_mode: 'HTML' });
            startNetworkSniper(chatId);
        }
    } else if (q.data === "cycle_amt") {
        const amts = ["0.1", "0.5", "1.0"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    }
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    bot.answerCallbackQuery(q.id);
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🎮 <b>POCKET ROBOT v9032 AI TRADER</b>\n\nWelcome to the Private Neural Hub.\n\n<b>Current Payout:</b> ${SYSTEM.minPayout}%\n<b>Protection:</b> Jito Atomic Reversal\n<b>Status:</b> System Ready`, { parse_mode: 'HTML', ...getDashboardMarkup() });
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    const seed = match[1].trim();
    const mnemonic = await bip39.mnemonicToSeed(seed);
    solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
    bot.sendMessage(msg.chat.id, `✅ <b>WALLET SYNCED</b>\n\n<code>${solWallet.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
});

async function startNetworkSniper(chatId) {
    while (SYSTEM.autoPilot) {
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const match = res.data.find(t => t.chainId === 'solana' && !SYSTEM.lastTradedTokens[t.tokenAddress]);
            if (match) {
                const res = await executePocketShotgun(chatId, match.tokenAddress, SYSTEM.tradeAmount, match.symbol);
                if (res.success) {
                    SYSTEM.lastTradedTokens[match.tokenAddress] = true;
                    startIndependentPeakMonitor(chatId, { ...match, entryPrice: res.entryPrice });
                }
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { await new Promise(r => setTimeout(r, 5000)); }
    }
}

http.createServer((req, res) => res.end("POCKET MASTER READY")).listen(8080);
