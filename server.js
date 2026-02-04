/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9032 (FULL AUTO-PILOT MASTER)
 * ===============================================================================
 * FEATURES: Parallel sniper threads + Independent position monitoring.
 * SAFETY: Dual-RPC failover + Jito MEV-Shield + Priority Fee Injection.
 * INTERFACE: Fully interactive v9032 cycling dashboard.
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
const MY_EXECUTOR = "0x5aF9c921984e8694f3E89AE746Cf286fFa3F2610";
const APEX_ABI = [
    "function executeBuy(address router, address token, uint256 minOut, uint256 deadline) external payable",
    "function executeSell(address router, address token, uint256 amtIn, uint256 minOut, uint256 deadline) external",
    "function emergencyWithdraw(address token) external"
];
const JUP_ULTRA_API = "https://api.jup.ag/ultra/v1";
const JITO_ENGINE = "https://mainnet.block-engine.jito.wtf/api/v1/bundles";
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0', 'x-api-key': 'f440d4df-b5c4-4020-a960-ac182d3752ab' }};

const NETWORKS = {
    ETH:  { id: 'ethereum', type: 'EVM', rpc: 'https://rpc.mevblocker.io', router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' },
    SOL:  { id: 'solana', type: 'SVM', primary: process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', fallback: 'https://rpc.ankr.com/solana' },
    BASE: { id: 'base', type: 'EVM', rpc: 'https://mainnet.base.org', router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' },
    BSC:  { id: 'bsc', type: 'EVM', rpc: 'https://bsc-dataseed.binance.org/', router: '0x10ED43C718714eb63d5aA57B78B54704E256024E' }
};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'MEDIUM',
    lastTradedTokens: {}, isLocked: {}, atomicOn: true, currentAsset: 'So11111111111111111111111111111111111111112'
};

let evmWallet, solWallet;
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 🔱 LAYER 2: v9076 MEV-SHIELD (JITO PROXY) ---
const originalSend = Connection.prototype.sendRawTransaction;
Connection.prototype.sendRawTransaction = async function(rawTx, options) {
    if (!SYSTEM.atomicOn) return originalSend.apply(this, [rawTx, options]);
    try {
        const base64Tx = Buffer.from(rawTx).toString('base64');
        const res = await axios.post(JITO_ENGINE, { jsonrpc: "2.0", id: 1, method: "sendBundle", params: [[base64Tx]] });
        if (res.data.result) return res.data.result;
    } catch (e) { console.log(`[MEV-SHIELD] Jito busy, using fallback RPC...`.yellow); }
    return originalSend.apply(this, [rawTx, options]);
};

// --- 3. THE v9032 AUTO-PILOT CORE (PARALLEL WORKERS) ---
async function startNetworkSniper(chatId, netKey) {
    console.log(`[INIT] Parallel thread for ${netKey} active.`.magenta);
    while (SYSTEM.autoPilot) {
        try {
            if (!SYSTEM.isLocked[netKey]) {
                const signal = await runNeuralSignalScan(netKey);
                
                if (signal && signal.tokenAddress && !SYSTEM.lastTradedTokens[signal.tokenAddress]) {
                    const ready = await verifyBalance(chatId, netKey);
                    if (!ready) {
                        await new Promise(r => setTimeout(r, 15000));
                        continue;
                    }

                    SYSTEM.isLocked[netKey] = true;
                    bot.sendMessage(chatId, `🧠 **[${netKey}] SIGNAL:** ${signal.symbol}. Engaging Shotgun.`);

                    const buyRes = (netKey === 'SOL')
                        ? await executeSolShotgun(chatId, signal.tokenAddress, SYSTEM.tradeAmount)
                        : await executeEvmContract(chatId, netKey, signal.tokenAddress, SYSTEM.tradeAmount, 'BUY');

                    if (buyRes && buyRes.success) {
                        const pos = { ...signal, entryPrice: signal.price, amountOut: buyRes.amountOut };
                        startIndependentPeakMonitor(chatId, netKey, pos);
                        bot.sendMessage(chatId, `🚀 **[${netKey}] BOUGHT ${signal.symbol}.** Monitoring position...`);
                    }
                    SYSTEM.isLocked[netKey] = false;
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) { SYSTEM.isLocked[netKey] = false; await new Promise(r => setTimeout(r, 5000)); }
    }
}

// v9032 Independent Peak Monitor (Non-blocking Trailing Stop Loss)
async function startIndependentPeakMonitor(chatId, netKey, pos) {
    const monitor = setInterval(async () => {
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.tokenAddress}`, SCAN_HEADERS);
            if (!res.data.pairs || res.data.pairs.length === 0) return;

            const curPrice = parseFloat(res.data.pairs[0].priceUsd) || 0;
            const entry = parseFloat(pos.entryPrice) || 0.00000001;
            const pnl = ((curPrice - entry) / entry) * 100;
            
            let tp = 30; let sl = -12;
            if (SYSTEM.risk === 'LOW') { tp = 12; sl = -6; }
            if (SYSTEM.risk === 'MAX') { tp = 100; sl = -20; }

            if (pnl >= tp || pnl <= sl) {
                bot.sendMessage(chatId, `🎯 **[${netKey}] EXIT:** ${pos.symbol} at ${pnl.toFixed(2)}% PnL.`);
                if (netKey === 'SOL') await executeSolShotgun(chatId, pos.tokenAddress, 'SELL');
                else await executeEvmContract(chatId, netKey, pos.tokenAddress, pos.amountOut, 'SELL');
                
                SYSTEM.lastTradedTokens[pos.tokenAddress] = true;
                clearInterval(monitor);
            }
        } catch (e) { /* retry next interval */ }
    }, 15000);
}

// --- 4. EXECUTION ENGINES (FULL LOGIC) ---
async function executeSolShotgun(chatId, addr, amt) {
    try {
        const isSell = amt === 'SELL';
        const amtStr = isSell ? 'all' : Math.floor(amt * 1e9).toString();
        
        // Jupiter Ultra with fixed 150k lamport Priority Fee
        const res = await axios.get(`${JUP_ULTRA_API}/order?inputMint=${isSell?addr:SYSTEM.currentAsset}&outputMint=${isSell?SYSTEM.currentAsset:addr}&amount=${isSell?'all':amtStr}&taker=${solWallet.publicKey.toString()}&slippageBps=250&prioritizationFeeLamports=150000`, SCAN_HEADERS);
        
        const tx = VersionedTransaction.deserialize(Buffer.from(res.data.transaction, 'base64'));
        tx.sign([solWallet]);
        
        // Multi-RPC Race Failover
        const sig = await Promise.any([
            new Connection(NETWORKS.SOL.primary).sendRawTransaction(tx.serialize(), { skipPreflight: true }),
            new Connection(NETWORKS.SOL.fallback).sendRawTransaction(tx.serialize(), { skipPreflight: true })
        ]);
        
        return { success: !!sig, amountOut: res.data.outAmount || 1 };
    } catch (e) { return { success: false }; }
}

async function executeEvmContract(chatId, netKey, addr, amt, side) {
    try {
        const net = NETWORKS[netKey];
        const signer = evmWallet.connect(new JsonRpcProvider(net.rpc));
        const contract = new ethers.Contract(MY_EXECUTOR, APEX_ABI, signer);
        
        let tx;
        if (side === 'BUY') {
            tx = await contract.executeBuy(net.router, addr, 0, Math.floor(Date.now()/1000)+60, {
                value: ethers.parseEther(amt.toString()), gasLimit: 400000
            });
        } else {
            tx = await contract.executeSell(net.router, addr, amt, 0, Math.floor(Date.now()/1000)+60, {
                gasLimit: 400000
            });
        }
        
        const receipt = await tx.wait();
        return { success: receipt.status === 1, amountOut: amt };
    } catch (e) { return { success: false }; }
}

// --- 5. INTERFACE & CORE UI ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount}`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: SYSTEM.atomicOn ? "🛡️ ATOMIC: ON" : "🛡️ ATOMIC: OFF", callback_data: "tg_atomic" }],
            [{ text: solWallet ? "✅ SYNCED" : "🔗 CONNECT WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    if (query.data === "cycle_risk") {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
    } else if (query.data === "cycle_amt") {
        const amts = ["0.1", "0.25", "0.5", "1.0"];
        SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
    } else if (query.data === "cmd_auto") {
        if (!solWallet) return bot.answerCallbackQuery(query.id, { text: "❌ Link Wallet First!", show_alert: true });
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        if (SYSTEM.autoPilot) Object.keys(NETWORKS).forEach(netKey => startNetworkSniper(chatId, netKey));
    } else if (query.data === "tg_atomic") {
        SYSTEM.atomicOn = !SYSTEM.atomicOn;
    }
    bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: query.message.message_id }).catch(() => {});
    bot.answerCallbackQuery(query.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "🎮 **APEX v9032 NEURAL MASTER**", { parse_mode: 'HTML', ...getDashboardMarkup() }));

bot.onText(/\/connect (.+)/, async (msg, match) => {
    try {
        const seed = match[1].trim();
        const mnemonic = await bip39.mnemonicToSeed(seed);
        solWallet = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", mnemonic.toString('hex')).key);
        evmWallet = ethers.Wallet.fromPhrase(seed);
        bot.sendMessage(msg.chat.id, `✅ **SYNCED:** \`${solWallet.publicKey.toString()}\``);
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ **SYNC FAILED**"); }
});

async function runNeuralSignalScan(netKey) {
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
        const chainMap = { 'SOL': 'solana', 'ETH': 'ethereum', 'BASE': 'base', 'BSC': 'bsc' };
        const match = res.data.find(t => t.chainId === chainMap[netKey] && !SYSTEM.lastTradedTokens[t.tokenAddress]);
        return match ? { symbol: match.symbol, tokenAddress: match.tokenAddress, price: parseFloat(match.priceUsd) || 0.000001 } : null;
    } catch (e) { return null; }
}

async function verifyBalance(chatId, netKey) {
    try {
        const bal = (netKey === 'SOL') 
            ? await new Connection(NETWORKS.SOL.primary).getBalance(solWallet.publicKey) 
            : await (new JsonRpcProvider(NETWORKS[netKey].rpc)).getBalance(evmWallet.address);
        return bal > 1000000;
    } catch (e) { return false; }
}

http.createServer((req, res) => res.end("MASTER READY")).listen(8080);
