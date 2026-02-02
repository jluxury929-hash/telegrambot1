/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (FULL AUTO-PILOT MASTER)
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

// --- 1. CONFIGURATION ---
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'x-api-key': process.env.BIRDEYE_API_KEY }};
const MY_EXECUTOR = "0x5aF9c921984e8694f3E89AE746Cf286fFa3F2610";
const APEX_ABI = [
    "function executeBuy(address router, address token, uint256 minOut, uint256 deadline) external payable",
    "function executeSell(address router, address token, uint256 amtIn, uint256 minOut, uint256 deadline) external"
];

const NETWORKS = {
    ETH:  { id: 'ethereum', rpc: 'https://rpc.mevblocker.io', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', sym: 'ETH' },
    SOL:  { id: 'solana', primary: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', fallback: 'https://rpc.ankr.com/solana' },
    BASE: { id: 'base', rpc: 'https://mainnet.base.org', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', sym: 'ETH' },
    BSC:  { id: 'bsc', rpc: 'https://bsc-dataseed.binance.org/', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', sym: 'BNB' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: {}, highestBalance: 0
};

let solWallet, evmWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. INTERACTIVE DASHBOARD ---
const RISK_LABELS = { LOW: '🛡️ LOW', MEDIUM: '⚖️ MED', MAX: '🔥 MAX' };
const TERM_LABELS = { SHORT: '⏱️ SHRT', MEDIUM: '⏳ MED', LONG: '💎 LONG' };

const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${RISK_LABELS[SYSTEM.risk]}`, callback_data: "cycle_risk" }, { text: `⏳ TERM: ${TERM_LABELS[SYSTEM.mode]}`, callback_data: "cycle_mode" }],
            [{ text: solWallet ? "✅ WALLET LINKED" : "🔌 CONNECT WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

// --- 3. AUTO-PILOT ENGINE ---


async function startNetworkSniper(chatId, netKey) {
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                if (signal && signal.tokenAddress) {
                    const ready = await verifyBalance(chatId, netKey);
                    if (!ready) continue;

                    SYSTEM.isLocked[netKey] = true;
                    bot.sendMessage(chatId, `🎯 **[${netKey}] SIGNAL:** ${signal.symbol}. Sniper Engaging...`);

                    const buyRes = (netKey === 'SOL')
                        ? await executeSolShotgun(chatId, signal.tokenAddress, SYSTEM.tradeAmount)
                        : await executeEvmContract(chatId, netKey, signal.tokenAddress, SYSTEM.tradeAmount);

                    if (buyRes && buyRes.success) {
                        SYSTEM.lastTradedTokens[signal.tokenAddress] = true;
                        startIndependentPeakMonitor(chatId, netKey, { ...signal, entryPrice: signal.price });
                    }
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 3000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 5000)); }
    }
}

async function startIndependentPeakMonitor(chatId, netKey, pos) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
        const curPrice = parseFloat(res.data.pairs?.[0]?.priceUsd) || 0;
        const entry = parseFloat(pos.entryPrice) || 0.00000001;
        const pnl = ((curPrice - entry) / entry) * 100;

        let tp = 25; let sl = -10;
        if (SYSTEM.risk === 'LOW') { tp = 12; sl = -5; }
        if (SYSTEM.risk === 'MAX') { tp = 100; sl = -20; }

        if (pnl >= tp || pnl <= sl) {
            bot.sendMessage(chatId, `📉 **[${netKey}] EXIT:** ${pos.symbol} at ${pnl.toFixed(2)}% PnL.`);
        } else { setTimeout(() => startIndependentPeakMonitor(chatId, netKey, pos), 10000); }
    } catch (e) { setTimeout(() => startIndependentPeakMonitor(chatId, netKey, pos), 15000); }
}

// --- 4. EXECUTION ENGINES (v9032 Ultra Logic) ---
async function executeSolShotgun(chatId, addr, amt) {
    try {
        const amtStr = Math.floor(amt * 1e9).toString();
        // Request order from Jup Ultra V1
        const res = await axios.get(`${JUP_ULTRA_API}/order?inputMint=So11111111111111111111111111111111111111112&outputMint=${addr}&amount=${amtStr}&taker=${solWallet.publicKey.toString()}&slippageBps=200`, SCAN_HEADERS);
        
        const tx = VersionedTransaction.deserialize(Buffer.from(res.data.transaction, 'base64'));
        tx.sign([solWallet]);

        // Dual-RPC Failover Shotgun
        const sig = await Promise.any([
            new Connection(NETWORKS.SOL.primary).sendRawTransaction(tx.serialize(), { skipPreflight: true }),
            new Connection(NETWORKS.SOL.fallback).sendRawTransaction(tx.serialize(), { skipPreflight: true })
        ]);
        return { success: !!sig };
    } catch (e) { return { success: false }; }
}

async function executeEvmContract(chatId, netKey, addr, amt) {
    try {
        const net = NETWORKS[netKey];
        const signer = evmWallet.connect(new JsonRpcProvider(net.rpc));
        const contract = new ethers.Contract(MY_EXECUTOR, APEX_ABI, signer);
        const tx = await contract.executeBuy(net.router, addr, 0, Math.floor(Date.now()/1000)+120, {
            value: ethers.parseEther(amt.toString()), gasLimit: 350000
        });
        await tx.wait(); return { success: true };
    } catch (e) { return { success: false }; }
}

// --- 5. SIGNAL & CALLBACKS (ANTI-STICKY UI) ---
async function runNeuralSignalScan(netKey) {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const chainMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base', 'BSC': 'bsc' };
        const match = res.data.find(t => t.chainId === chainMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol || "UNK", tokenAddress: match.tokenAddress, price: parseFloat(match.amount) || 0.0001 } : null;
    } catch (e) { return null; }
}

async function verifyBalance(chatId, netKey) {
    try {
        if (netKey === 'SOL' && solWallet) {
            const bal = await (new Connection(NETWORKS.SOL.primary)).getBalance(solWallet.publicKey);
            return bal >= (parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);
        }
        return true;
    } catch (e) { return false; }
}

bot.on('callback_query', async (query) => {
    const { data, message, id } = query;
    const chatId = message.chat.id;

    // FIX STICKINESS: Answer callback IMMEDIATELY to stop loading spinner
    bot.answerCallbackQuery(id).catch(() => {});

    try {
        if (data === "cycle_risk") {
            const risks = ["LOW", "MEDIUM", "MAX"];
            SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
        } else if (data === "cycle_amt") {
            const amts = ["0.01", "0.05", "0.1", "0.25", "0.5"];
            SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
        } else if (data === "cycle_mode") {
            const terms = ["SHORT", "MEDIUM", "LONG"];
            SYSTEM.mode = terms[(terms.indexOf(SYSTEM.mode) + 1) % terms.length];
        } else if (data === "cmd_auto") {
            if (!solWallet) return bot.sendMessage(chatId, "❌ **Wallet missing.** Sync mnemonic first.");
            SYSTEM.autoPilot = !SYSTEM.autoPilot;
            if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, "🔥 **AUTO-PILOT ONLINE.** Parallel threads active.");
                Object.keys(NETWORKS).forEach(netKey => startNetworkSniper(chatId, netKey));
            }
        } else if (data === "cmd_status") {
            await runStatusDashboard(chatId);
            return;
        }

        // FORCE UI REFRESH
        bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { 
            chat_id: chatId, 
            message_id: message.message_id 
        }).catch((e) => {
            if (!e.message.includes("message is not modified")) console.error(e.message);
        });

    } catch (err) { console.error("UI Update Error:", err); }
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "⚔️ **APEX MASTER v9032**", getDashboardMarkup()));

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = match[1].trim();
        const hex = (await bip39.mnemonicToSeed(seed)).toString('hex');
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        evmWallet = ethers.Wallet.fromPhrase(seed);
        bot.sendMessage(msg.chat.id, `✅ **SYNCED:** \`${solWallet.publicKey.toString()}\``, getDashboardMarkup());
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC FAILED.**"); }
});

async function runStatusDashboard(chatId) {
    let msg = `📊 **APEX STATUS**\n----------------------------\n`;
    for (const key of Object.keys(NETWORKS)) {
        try {
            if (key === 'SOL' && solWallet) {
                const bal = (await (new Connection(NETWORKS.SOL.primary)).getBalance(solWallet.publicKey)) / 1e9;
                msg += `🔹 **SOL:** ${bal.toFixed(3)} SOL\n`;
            } else if (evmWallet) {
                const bal = parseFloat(ethers.formatEther(await (new JsonRpcProvider(NETWORKS[key].rpc)).getBalance(evmWallet.address)));
                msg += `🔹 **${key}:** ${bal.toFixed(4)}\n`;
            }
        } catch (e) { msg += `🔹 **${key}:** Error\n`; }
    }
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

http.createServer((req, res) => res.end("MASTER READY")).listen(8080);
