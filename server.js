/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9079 (STICKY BUTTON FIX)
 * ===============================================================================
 * FIX: /risk, /term, and /connect buttons (Fully interactive & non-sticky).
 * FIX: UI Sync (Forced re-render of message text + buttons on every click).
 * FIX: answerCallbackQuery (Prevents the 2-second Telegram "spinner" hang).
 * AUTO: startNetworkSniper logic UNCHANGED - fully operational.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, JsonRpcProvider } = require('ethers');
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 1. CORE INITIALIZATION ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. GLOBAL STATE ---
const JUP_API = "https://quote-api.jup.ag/v6";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};
const CAD_RATES = { SOL: 248.15, ETH: 4920.00, BNB: 865.00 };

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: {},
    currentAsset: 'So11111111111111111111111111111111111111112',
    entryPrice: 0, currentPnL: 0, currentSymbol: 'SOL'
};
let solWallet, evmWallet;

const NETWORKS = {
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', sym: 'ETH' },
    SOL:  { id: 'solana', endpoints: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana'], sym: 'SOL' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', sym: 'ETH' },
    BSC:  { id: 'bsc', rpc: 'https://bsc-dataseed.binance.org/', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', sym: 'BNB' },
    ARB:  { id: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', sym: 'ETH' }
};

// --- 3. DYNAMIC UI DASHBOARD ---

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount}`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ TERM: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: "🔗 CONNECT WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

const getDashboardText = () => {
    return `<b>⚡️ APEX OMNI-MASTER v9079</b>\n` +
           `<i>Precision Neural Engine Active.</i>\n\n` +
           `<b>Risk Level:</b> <code>${SYSTEM.risk}</code>\n` +
           `<b>Trade Term:</b> <code>${SYSTEM.mode}</code>\n` +
           `<b>Trade Size:</b> <code>${SYSTEM.tradeAmount} Unit(s)</code>`;
};

// --- 4. CALLBACK & COMMAND LISTENERS (FIXED & RESPONSIVE) ---

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // Acknowledge immediately to kill the "sticky" spinner
    await bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        if (query.data === "cycle_amt") {
            const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
            SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
        } 
        else if (query.data === "cycle_risk") {
            const risks = ['LOW', 'MEDIUM', 'HIGH'];
            SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
        } 
        else if (query.data === "cycle_mode") {
            const modes = ['SHORT', 'MEDIUM', 'LONG'];
            SYSTEM.mode = modes[(modes.indexOf(SYSTEM.mode) + 1) % modes.length];
        } 
        else if (query.data === "cmd_auto") {
            if (!solWallet) return bot.sendMessage(chatId, "⚠️ <b>Connect Wallet First!</b>", { parse_mode: 'HTML' });
            SYSTEM.autoPilot = !SYSTEM.autoPilot;
            if (SYSTEM.autoPilot) Object.keys(NETWORKS).forEach(net => startNetworkSniper(chatId, net));
        } 
        else if (query.data === "cmd_status") {
            return runStatusDashboard(chatId);
        }
        else if (query.data === "cmd_conn") {
            return bot.sendMessage(chatId, "⌨️ <b>Action Required:</b>\nType <code>/connect your_seed_phrase</code> to link wallets.", { parse_mode: 'HTML' });
        }

        // FORCE REFRESH: Edits both text and buttons to reflect new state
        await bot.editMessageText(getDashboardText(), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            ...getDashboardMarkup()
        }).catch(() => {});

    } catch (e) { console.error("UI Update Error: ".red, e.message); }
});

bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, getDashboardText(), { parse_mode: 'HTML', ...getDashboardMarkup() });
});

bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    SYSTEM.tradeAmount = match[1];
    bot.sendMessage(msg.chat.id, `✅ <b>TRADE SIZE:</b> <code>${SYSTEM.tradeAmount}</code>`, { parse_mode: 'HTML' });
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const mnemonic = match[1].trim();
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const hex = seed.toString('hex');
        const conn = new Connection(NETWORKS.SOL.endpoints[0]);
        const keyA = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        const keyB = Keypair.fromSeed(derivePath("m/44'/501'/0'", hex).key);
        solWallet = (await conn.getBalance(keyB.publicKey) > await conn.getBalance(keyA.publicKey)) ? keyB : keyA;
        evmWallet = ethers.Wallet.fromPhrase(mnemonic);
        bot.sendMessage(msg.chat.id, `🔗 <b>OMNI-SYNC SUCCESS</b>\n📍 SOL: <code>${solWallet.publicKey.toString()}</code>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ <b>SYNC FAILED</b>"); }
});

// --- 5. OMNI-EXECUTION ENGINE (AUTO MODE - UNCHANGED) ---



async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress) {
                    const isSafe = await verifyOmniTruth(chatId, netKey);
                    if (!isSafe) { await new Promise(r => setTimeout(r, 60000)); continue; }
                    SYSTEM.isLocked[netKey] = true;
                    bot.sendMessage(chatId, `🧠 <b>[${netKey}] SIGNAL:</b> $${signal.symbol}\nRotating capital...`, { parse_mode: 'HTML' });
                    const res = (netKey === 'SOL')
                        ? await executeAggressiveSolRotation(chatId, signal.tokenAddress, signal.symbol)
                        : await executeEvmContract(chatId, netKey, signal.tokenAddress);
                    if (res) SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 4000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 10000)); }
    }
}

// ... verifyOmniTruth, executeAggressiveSolRotation, executeEvmContract, and runNeuralSignalScan logic remains as per v9076/77

function runStatusDashboard(chatId) {
    if (!solWallet) return;
    bot.sendMessage(chatId, `📊 <b>OMNI STATUS</b>\n📦 <b>HOLDING:</b> $${SYSTEM.currentSymbol}\n📉 <b>PnL:</b> ${SYSTEM.currentPnL.toFixed(2)}%`, { parse_mode: 'HTML' });
}

http.createServer((req, res) => res.end("v9079 READY")).listen(8080);
