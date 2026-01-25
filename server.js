/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9076 (OMNI-PRECISION MASTER)
 * ===============================================================================
 * FIX: ReferenceError (Bot hoisted & initialized at top scope).
 * FIX: Button Lag (answerCallbackQuery is the first line of every interaction).
 * NEW: Universal Fuel Guard (SOL, ETH, BNB balance checks for all 5 networks).
 * NEW: $CAD Precision Shield (Blocks trades where fees > 15% of trade value).
 * SPEED: Aggressive 2s Rebroadcast + Multi-RPC SOL Failover.
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

// --- 2. GLOBAL CONFIG & RATES ---
const JUP_API = "https://quote-api.jup.ag/v6";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};
const CAD_RATES = { SOL: 248.15, ETH: 4920.00, BNB: 865.00 }; // 2026 CAD Est.

const NETWORKS = {
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', sym: 'ETH' },
    SOL:  { id: 'solana', endpoints: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana'], sym: 'SOL' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', sym: 'ETH' },
    BSC:  { id: 'bsc', rpc: 'https://bsc-dataseed.binance.org/', sym: 'BNB' },
    ARB:  { id: 'arbitrum', rpc: 'https://arb1.arbitrum.io/rpc', sym: 'ETH' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: {}, 
    currentAsset: 'So11111111111111111111111111111111111111112',
    entryPrice: 0, currentPnL: 0, currentSymbol: 'SOL'
};
let solWallet, evmWallet;

// --- 3. UNIVERSAL FUEL & TRUTH GUARD ---

async function verifyOmniFuel(chatId, netKey) {
    const tradeAmt = parseFloat(SYSTEM.tradeAmount);
    try {
        if (netKey === 'SOL') {
            const conn = new Connection(NETWORKS.SOL.endpoints[0]);
            const bal = await conn.getBalance(solWallet.publicKey);
            const rent = 2039280; // Standard Token Account Rent
            const fee = 150000;   // 2.5x Priority Buffer
            const total = (tradeAmt * LAMPORTS_PER_SOL) + rent + fee;

            if (bal < total) {
                bot.sendMessage(chatId, `❌ <b>[SOL] INSUFFICIENT FUNDS:</b>\nNeed: <code>${(total/1e9).toFixed(4)}</code> | Have: <code>${(bal/1e9).toFixed(4)}</code>`, { parse_mode: 'HTML' });
                return false;
            }
            // CAD Profitability Shield (15% Rule)
            const cadFee = ((rent + fee) / 1e9) * CAD_RATES.SOL;
            if (cadFee > (tradeAmt * CAD_RATES.SOL * 0.15)) {
                bot.sendMessage(chatId, `🛡️ <b>[SOL] SHIELD:</b> Trade Blocked. Fee ($${cadFee.toFixed(2)} CAD) exceeds 15% of your $${(tradeAmt * CAD_RATES.SOL).toFixed(2)} trade.`, { parse_mode: 'HTML' });
                return false;
            }
        } else {
            const net = NETWORKS[netKey];
            const provider = new JsonRpcProvider(net.rpc);
            const bal = await provider.getBalance(evmWallet.address);
            const gasBuffer = ethers.parseUnits("0.0005", "ether"); // Buffer for L2 gas
            const total = ethers.parseEther(tradeAmt.toString()) + gasBuffer;

            if (bal < total) {
                bot.sendMessage(chatId, `❌ <b>[${netKey}] INSUFFICIENT FUNDS:</b>\nNeed: <code>${ethers.formatEther(total)} ${net.sym}</code>\nHave: <code>${ethers.formatEther(bal)}</code>`, { parse_mode: 'HTML' });
                return false;
            }
        }
        return true;
    } catch (e) { return false; }
}

// --- 4. MENU & BUTTON CONTROLLERS (FIXED UI) ---

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

bot.on('callback_query', async (query) => {
    // FIX: Acknowledge callback immediately to stop button "spinning"
    await bot.answerCallbackQuery(query.id).catch(() => {});
    const chatId = query.message.chat.id;

    if (query.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
    } else if (query.data === "cycle_amt") {
        const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    } else if (query.data === "cmd_auto") {
        if (!solWallet) return bot.sendMessage(chatId, "⚠️ <b>Connect Wallet First!</b>", { parse_mode: 'HTML' });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) Object.keys(NETWORKS).forEach(net => startNetworkSniper(chatId, net));
    } else if (query.data === "cmd_status") {
        return runStatusDashboard(chatId);
    }

    // FIX: Force UI refresh with updated state
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
});

// --- 5. OMNI-EXECUTION ENGINE ---

async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress) {
                    // TRUTH CHECK BEFORE BROADCAST
                    const verified = await verifyOmniFuel(chatId, netKey);
                    if (!verified) { await new Promise(r => setTimeout(r, 60000)); continue; }

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

// ... [executeAggressiveSolRotation (with 2s spam loop) & EVM execution logic from v9069/v9073]

bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>⚡️ APEX v9076 ONLINE</b>", { parse_mode: 'HTML', ...getDashboardMarkup() });
});

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = await bip39.mnemonicToSeed(match[1].trim());
        const hex = seed.toString('hex');
        const conn = new Connection(NETWORKS.SOL.endpoints[0]);
        const keyA = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        const keyB = Keypair.fromSeed(derivePath("m/44'/501'/0'", hex).key);
        solWallet = (await conn.getBalance(keyB.publicKey) > await conn.getBalance(keyA.publicKey)) ? keyB : keyA;
        evmWallet = ethers.Wallet.fromPhrase(match[1].trim());
        bot.sendMessage(msg.chat.id, `🔗 <b>OMNI-SYNC SUCCESS</b>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ <b>SYNC FAILED</b>"); }
});

http.createServer((req, res) => res.end("v9076 READY")).listen(8080);
