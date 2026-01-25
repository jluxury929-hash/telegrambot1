/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9080 (REVERTED AUTO + RESPONSIVE UI)
 * ===============================================================================
 * AUTO: REVERTED - Using original startNetworkSniper & Aggressive Rebroadcast.
 * FIX: RISK, TERM, & CONNECT buttons now fully interactive and non-sticky.
 * FIX: answerCallbackQuery (Kills button spinner) + UI Refresh on every click.
 * NETWORKS: SOL, BASE, BSC, ETH, ARB (OMNI-DASHBOARD).
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

// --- 4. CALLBACK & COMMAND LISTENERS (FIXED & RESPONSIVE) ---

bot.on('callback_query', async (query) => {
    await bot.answerCallbackQuery(query.id).catch(() => {});
    const chatId = query.message.chat.id;

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
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, `🚀 <b>AUTO-PILOT ACTIVE.</b> Rotating Capital...`, { parse_mode: 'HTML' });
            Object.keys(NETWORKS).forEach(net => startNetworkSniper(chatId, net));
        }
    } 
    else if (query.data === "cmd_status") {
        return runStatusDashboard(chatId);
    }
    else if (query.data === "cmd_conn") {
        return bot.sendMessage(chatId, "⌨️ <b>Action Required:</b>\nType <code>/connect your_seed_phrase</code> to link.", { parse_mode: 'HTML' });
    }

    // Force UI refresh with updated labels
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { 
        chat_id: chatId, 
        message_id: query.message.message_id 
    }).catch(() => {});
});

bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>⚡️ APEX OMNI-MASTER v9080</b>\nOmni-Network Precision Engine Active.", { parse_mode: 'HTML', ...getDashboardMarkup() });
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
        bot.sendMessage(msg.chat.id, `🔗 <b>OMNI-SYNC SUCCESS</b>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ <b>SYNC FAILED</b>"); }
});

// --- 5. OMNI-EXECUTION ENGINE (ORIGINAL AUTO LOGIC) ---

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



async function executeAggressiveSolRotation(chatId, targetToken, symbol) {
    let rpcIdx = 0;
    while (rpcIdx < NETWORKS.SOL.endpoints.length) {
        try {
            const conn = new Connection(NETWORKS.SOL.endpoints[rpcIdx], 'confirmed');
            const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
            const quote = await axios.get(`${JUP_API}/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=300`);
            const { swapTransaction } = (await axios.post(`${JUP_API}/swap`, {
                quoteResponse: quote.data,
                userPublicKey: solWallet.publicKey.toString(),
                prioritizationFeeLamports: "auto",
                autoMultiplier: 2.5 
            })).data;
            const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
            tx.sign([solWallet]);
            const rawTx = tx.serialize();
            let confirmed = false;
            let sig = "";
            const interval = setInterval(async () => {
                if (confirmed) return clearInterval(interval);
                try { sig = await conn.sendRawTransaction(rawTx, { skipPreflight: true }); } catch (e) {}
            }, 2000);
            const startTime = Date.now();
            while (!confirmed && Date.now() - startTime < 45000) {
                const status = await conn.getSignatureStatus(sig);
                if (status?.value?.confirmationStatus === 'confirmed') {
                    confirmed = true;
                    clearInterval(interval);
                    SYSTEM.currentAsset = targetToken;
                    SYSTEM.currentSymbol = symbol;
                    bot.sendMessage(chatId, `✅ <b>SOL SUCCESS:</b> $${symbol} landed.`, { parse_mode: 'HTML' });
                    return true;
                }
                await new Promise(r => setTimeout(r, 1500));
            }
            clearInterval(interval);
            rpcIdx++;
        } catch (e) { rpcIdx++; }
    }
    return false;
}

// ... verifyOmniTruth, executeEvmContract, runNeuralSignalScan, runStatusDashboard functions from v9076/77 ...

http.createServer((req, res) => res.end("v9080 READY")).listen(8080);
