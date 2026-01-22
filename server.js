/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v1200.0 (BLOCK-WINNER EDITION)
 * ===============================================================================
 * STATUS: GOD MODE ACTIVE
 * 1. WIN THE BLOCK: Uses 500% Priority Fees + Multi-Block Flashbots Bundling.
 * 2. AUTO-PILOT FIXED: Continuous AI scanning with instant trigger execution.
 * 3. MANUAL OVERRIDE: /buy & /approve force-mine transactions immediately.
 * 4. QUANTUM FLOOD: Spams tx to 4 RPCs + Flashbots Relay simultaneously.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
require('colors');

// ==========================================
// 0. CONFIGURATION
// ==========================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const WSS_NODE_URL = process.env.WSS_NODE_URL; 

const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; 
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://rpc.mevblocker.io" }
};

// Quantum Flood Cluster
const EXECUTION_WSS = [
    "wss://rpc.mevblocker.io",
    "wss://eth.llamarpc.com",
    "wss://rpc.ankr.com/eth/ws/none",
    "wss://ethereum.publicnode.com"
];

const AI_SITES = ["https://api.dexscreener.com/token-boosts/top/v1"];
const HYPE_THRESHOLD = 5;
const HYPE_WINDOW_MS = 2000;

// ==========================================
// 1. RPG & STATE ENGINE
// ==========================================
let PLAYER = {
    level: 1, xp: 0, nextLevelXp: 1000, class: "HUNTING CUB",
    inventory: ["Block Winner Badge", "Nuclear Codes"],
    dailyQuests: [
        { id: 'scan', task: "Scan Market", count: 0, target: 5, done: false, xp: 150 },
        { id: 'trade', task: "Win a Block", count: 0, target: 1, done: false, xp: 1000 }
    ]
};

const addXP = (amount, bot, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++; PLAYER.xp -= PLAYER.nextLevelXp;
        PLAYER.nextLevelXp = Math.floor(PLAYER.nextLevelXp * 1.5);
        PLAYER.class = getRankName(PLAYER.level);
        if(chatId) bot.sendMessage(chatId, `🆙 **PROMOTION:** Operator Level ${PLAYER.level} (${PLAYER.class})!`);
    }
};

const getRankName = (lvl) => {
    if (lvl < 5) return "HUNTING CUB";
    if (lvl < 10) return "BLOCK STRIKER";
    if (lvl < 20) return "MEV GOD";
    return "APEX PREDATOR";
};

const updateQuest = (type, bot, chatId) => {
    PLAYER.dailyQuests.forEach(q => {
        if (q.id === type && !q.done) {
            q.count++;
            if (q.count >= q.target) {
                q.done = true;
                addXP(q.xp, bot, chatId);
                if(chatId) bot.sendMessage(chatId, `✅ **QUEST COMPLETE:** ${q.task} (+${q.xp} XP)`);
            }
        }
    });
};

const getXpBar = () => {
    const p = Math.min(Math.round((PLAYER.xp / PLAYER.nextLevelXp) * 10), 10);
    return "🟩".repeat(p) + "⬛".repeat(10 - p);
};

// ==========================================
// 2. AI & MEMPOOL ENGINE
// ==========================================
class AIEngine {
    constructor(governor) {
        this.governor = governor;
        this.mempoolCounts = {}; 
        this.processedTxHashes = new Set();
    }

    async enrichTokenData(address) {
        if (!address || !ethers.isAddress(address)) return null;
        try {
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
            if (res.data && res.data.pairs && res.data.pairs.length > 0) {
                const pair = res.data.pairs.find(p => p.chainId === 'ethereum') || res.data.pairs[0];
                return {
                    name: pair.baseToken.name,
                    symbol: pair.baseToken.symbol,
                    priceUsd: pair.priceUsd
                };
            }
        } catch (e) { return null; }
        return { name: "Unknown", symbol: "???", priceUsd: "0.00" };
    }

    async scanWeb() {
        const signals = [];
        for (const url of AI_SITES) {
            try {
                const res = await axios.get(url, { timeout: 2000 });
                if (Array.isArray(res.data)) {
                    for (const t of res.data) {
                        // Strict EVM Filter
                        const isEVM = (t.chainId === 'ethereum' || t.chainId === 'base') || 
                                      (t.tokenAddress && t.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/));

                        if (isEVM && t.tokenAddress) {
                            const details = await this.enrichTokenData(t.tokenAddress);
                            if (details) {
                                signals.push({
                                    ticker: t.tokenAddress,
                                    symbol: details.symbol,
                                    name: details.name,
                                    price: details.priceUsd,
                                    source: "WEB_AI",
                                    score: 95 
                                });
                            }
                            if (signals.length >= 3) break;
                        }
                    }
                }
            } catch (e) {}
        }
        return signals;
    }

    startMempoolListener() {
        if (!WSS_NODE_URL) return console.log(`[WARN] No WSS_NODE_URL. Pre-Cog Disabled.`.red);
        const ws = new WebSocket(WSS_NODE_URL); 
        ws.on('open', () => {
            console.log(`[MEMPOOL] ✅ Active.`.green);
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newPendingTransactions"] }));
        });
        ws.on('message', async (data) => {
            if (!this.governor.system.autoPilot) return; // Only sniff in Auto Mode
            try {
                const res = JSON.parse(data);
                if (res.method === "eth_subscription") {
                    const txHash = res.params.result;
                    if (this.processedTxHashes.has(txHash)) return;
                    this.processedTxHashes.add(txHash);
                    if (this.processedTxHashes.size > 5000) this.processedTxHashes.clear();

                    const provider = this.governor.providers.ETHEREUM;
                    if(provider) {
                        const tx = await provider.getTransaction(txHash).catch(() => null);
                        if (tx && tx.to && tx.data) this.processPendingTx(tx);
                    }
                }
            } catch (e) {}
        });
        ws.on('error', () => setTimeout(() => this.startMempoolListener(), 5000));
    }

    processPendingTx(tx) {
        const to = tx.to.toLowerCase();
        if (to !== ROUTER_ADDR.toLowerCase()) return; 
        const matches = tx.data.toLowerCase().match(/0x[a-f0-9]{40}/g);
        if (matches) {
            for (const addr of matches) {
                if (ethers.isAddress(addr) && addr !== WETH.toLowerCase() && addr !== ROUTER_ADDR.toLowerCase()) {
                    this.updateHypeCounter(addr);
                    break; 
                }
            }
        }
    }

    updateHypeCounter(tokenAddress) {
        const now = Date.now();
        if (!this.mempoolCounts[tokenAddress]) this.mempoolCounts[tokenAddress] = [];
        this.mempoolCounts[tokenAddress].push(now);
        this.mempoolCounts[tokenAddress] = this.mempoolCounts[tokenAddress].filter(t => now - t < HYPE_WINDOW_MS);

        if (this.mempoolCounts[tokenAddress].length >= HYPE_THRESHOLD) {
            console.log(`[PRE-COG] 🚨 HYPE DETECTED: ${tokenAddress}`.bgRed.white);
            this.governor.processSignal({ 
                ticker: tokenAddress, 
                symbol: "PRE-COG", 
                name: "Mempool Hype",
                price: "Unknown", 
                source: "MEMPOOL",
                score: 99
            });
            this.mempoolCounts[tokenAddress] = []; 
        }
    }
}

// ==========================================
// 3. APEX OMNI GOVERNOR
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.ai = new AIEngine(this);
        this.providers = {};
        this.wallets = {}; 
        this.flashbots = null;
        this.execSockets = [];

        EXECUTION_WSS.forEach(url => {
            try { const ws = new WebSocket(url); ws.on('open', () => this.execSockets.push(ws)); ws.on('error', ()=>{}); } catch (e) {}
        });

        const net = ethers.Network.from(1);
        this.providers['ETHEREUM'] = new ethers.JsonRpcProvider(NETWORKS.ETHEREUM.rpc, net, { staticNetwork: net });

        this.bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
        this.setupTelegramListeners();

        this.system = {
            autoPilot: false,
            isLocked: false,
            activePosition: null,
            lastTradedToken: null, 
            pendingTarget: null,   
            riskProfile: 'DEGEN', // Default to Maximum Speed
            strategyMode: 'DAY',
            tradeAmount: "0.00002" 
        };

        this.risk = {
            LOW: { slippage: 50, gasMult: 110n },
            MEDIUM: { slippage: 200, gasMult: 150n },
            HIGH: { slippage: 500, gasMult: 200n },
            DEGEN: { slippage: 3000, gasMult: 500n } // 500% Gas Multiplier for Block Winning
        };
        this.strategies = {
            SCALP: { trail: 3, label: "Scalp (+3%)" },
            DAY: { trail: 10, label: "Day (+10%)" },
            MOON: { trail: 30, label: "Moon (+30%)" }
        };

        if(PRIVATE_KEY) this.connectWallet(PRIVATE_KEY);
        this.ai.startMempoolListener();
    }

    async connectWallet(privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey, this.providers.ETHEREUM);
            this.wallets['ETHEREUM'] = wallet;
            console.log(`[CONNECT] Wallet: ${wallet.address}`.green);
            this.flashbots = await FlashbotsBundleProvider.create(this.providers.ETHEREUM, wallet, "https://relay.flashbots.net");
            console.log(`[INIT] ☢️ FLASHBOTS ACTIVE`.magenta);
            return wallet.address;
        } catch (e) { return null; }
    }

    // --- NUCLEAR EXECUTION (THE MUSCLE) ---
    async executeStrike(signal, type) {
        const wallet = this.wallets['ETHEREUM'];
        if (!wallet) {
            if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, "⚠️ Connect wallet first!");
            return;
        }

        // --- 1. ROTATION SAFETY (SKIPPED FOR MANUAL/COMMAND) ---
        const isManual = (signal.source === "COMMAND" || signal.source === "MANUAL");
        if (type === "BUY" && !isManual && this.system.lastTradedToken === signal.ticker) {
            console.log(`[SKIP] Rotating from ${signal.symbol}.`.gray);
            return;
        }

        // --- 2. VALIDATION ---
        if (!ethers.isAddress(signal.ticker)) {
            console.log(`[ERROR] Invalid Address: ${signal.ticker}`.red);
            return;
        }

        // --- 3. DATA ENRICHMENT ---
        if (!signal.name || signal.name === "Unknown") {
            const details = await this.ai.enrichTokenData(signal.ticker);
            if(details) {
                signal.name = details.name;
                signal.symbol = details.symbol;
                signal.price = details.priceUsd;
            }
        }

        const config = this.risk[this.system.riskProfile];
        const provider = this.providers.ETHEREUM;

        // --- 4. GAS WAR MATH (WIN THE BLOCK) ---
        const feeData = await provider.getFeeData();
        const baseFee = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("10", "gwei");
        
        // DEGEN PRIORITY: If Manual or Degen, use 50 Gwei Priority (Massive Bribe)
        let prioVal = (isManual || this.system.riskProfile === 'DEGEN') ? "50.0" : "5.0";
        const priorityFee = ethers.parseUnits(prioVal, "gwei"); 
        
        // Max Fee = Base * Multiplier + Priority
        const aggMaxFee = ((baseFee * config.gasMult) / 100n) + priorityFee;

        const nonce = await provider.getTransactionCount(wallet.address, "latest");
        const router = new ethers.Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])"
        ], wallet);

        // --- 5. BUILD TRANSACTION ---
        let txRequest;
        if (type === "BUY") {
            const tradeVal = ethers.parseEther(this.system.tradeAmount);
            // Balance Check
            const bal = await provider.getBalance(wallet.address);
            if (bal < (tradeVal + ethers.parseEther("0.02"))) {
                if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, `⚠️ **FAIL:** Insufficient ETH.`);
                return;
            }

            txRequest = await router.swapExactETHForTokens.populateTransaction(
                0n, // YOLO Slippage (Speed Priority)
                [WETH, signal.ticker], 
                wallet.address, 
                Math.floor(Date.now()/1000)+120,
                { value: tradeVal, gasLimit: 600000, maxFeePerGas: aggMaxFee, maxPriorityFeePerGas: priorityFee, nonce }
            );
        } else {
            // SELL
            txRequest = await router.swapExactTokensForETH.populateTransaction(
                signal.amount, 0n, [signal.ticker, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
                { gasLimit: 600000, maxFeePerGas: aggMaxFee, maxPriorityFeePerGas: priorityFee, nonce }
            );
        }

        const signedTx = await wallet.signTransaction(txRequest);
        const txHash = ethers.keccak256(signedTx);
        
        // --- 6. QUANTUM FLOOD (The "Win" Mechanism) ---
        // A. Flashbots (Target Current + Next 2 Blocks)
        if (this.flashbots) {
            const block = await provider.getBlockNumber();
            const bundle = [{ signedTransaction: signedTx }];
            // Send to current block target (aggressive)
            this.flashbots.sendBundle(bundle, block + 1).catch(()=>{});
            this.flashbots.sendBundle(bundle, block + 2).catch(()=>{});
            this.flashbots.sendBundle(bundle, block + 3).catch(()=>{});
        }

        // B. Socket Flood (Spam 4 Public Nodes every 50ms)
        const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
        const killLoop = setInterval(() => {
            this.execSockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload); });
        }, 50);

        try {
            // C. Standard Broadcast (Fallback)
            const tx = await provider.broadcastTransaction(signedTx);
            console.log(`🚀 [ETH] Nuke Sent: ${tx.hash}`.yellow);
            
            if(process.env.CHAT_ID) {
                this.bot.sendMessage(process.env.CHAT_ID, `🚀 **TX SENT:** ${type} ${signal.symbol} (Gas: ${ethers.formatUnits(aggMaxFee, 'gwei')} Gwei)`);
            }

            const receipt = await tx.wait(1);
            if (receipt.status === 1) {
                console.log(`✅ [ETH] Block Won`.green);
                clearInterval(killLoop);
                
                if (type === "BUY") {
                    this.system.activePosition = {
                        address: signal.ticker,
                        symbol: signal.symbol,
                        name: signal.name,
                        amount: 0n, // Placeholder
                        entryPrice: ethers.parseEther(this.system.tradeAmount),
                        priceUsdEntry: signal.price
                    };
                    this.system.lastTradedToken = signal.ticker;
                    updateQuest('trade', this.bot, process.env.CHAT_ID);
                    
                    this.bot.sendMessage(process.env.CHAT_ID, 
                        `🦁 **BUY CONFIRMED: ${signal.name} (${signal.symbol})**\n` +
                        `💵 **Price:** $${signal.price}\n` +
                        `🤖 **AI Score:** ${signal.score || 99}/100\n` +
                        `🔗 [Etherscan](https://etherscan.io/tx/${tx.hash})`, 
                        {parse_mode: "Markdown", disable_web_page_preview: true}
                    );
                    this.runProfitMonitor();
                } else {
                    this.system.activePosition = null;
                    addXP(1000, this.bot, process.env.CHAT_ID);
                    this.bot.sendMessage(process.env.CHAT_ID, 
                        `💰 **SELL CONFIRMED: ${signal.name}**\n` +
                        `💵 **Exit Price:** $${signal.price}\n` +
                        `🔗 [Etherscan](https://etherscan.io/tx/${tx.hash})`,
                        {parse_mode: "Markdown", disable_web_page_preview: true}
                    );
                    if (this.system.autoPilot) this.runWebLoop();
                }
                return receipt;
            }
        } catch (e) {
            console.log(`[FAIL]: ${e.message}`.red);
            setTimeout(() => clearInterval(killLoop), 5000);
        }
    }

    // --- SIGNAL PROCESSOR ---
    async processSignal(signal) {
        // MANUAL or COMMAND source always bypasses checks and Fires
        if (signal.source === "MANUAL" || signal.source === "COMMAND") {
            await this.executeStrike(signal, "BUY");
            return;
        }

        // AUTO-PILOT LOGIC:
        if (this.system.autoPilot) {
            // Auto-Pilot is ON -> Fire immediately
            await this.executeStrike(signal, "BUY");
        } else {
            // Auto-Pilot is OFF -> Arm the system for /approve
            if (!signal.name) {
                const details = await this.ai.enrichTokenData(signal.ticker);
                if(details) Object.assign(signal, details);
            }
            this.system.pendingTarget = signal;
            if (process.env.CHAT_ID) {
                this.bot.sendMessage(process.env.CHAT_ID, 
                    `🎯 **TARGET FOUND:** ${signal.name} (${signal.symbol})\n` +
                    `💵 **Price:** $${signal.price}\n` + 
                    `⚠️ **ARMED.** Type \`/approve\` to Buy.`, 
                    {parse_mode: "Markdown"}
                );
            }
        }
    }

    async runWebLoop() {
        if (!this.system.autoPilot) return;
        updateQuest('scan', this.bot, process.env.CHAT_ID);
        const signals = await this.ai.scanWeb();
        if (signals.length > 0) {
            // Pick Top Signal
            const target = signals[0];
            // Filter: Don't auto-buy the same token twice in a row
            if (target.ticker !== this.system.lastTradedToken) {
                this.processSignal(target);
            }
        }
        // Loop speed: 3 seconds
        if (!this.system.activePosition && this.system.autoPilot) setTimeout(() => this.runWebLoop(), 3000);
    }

    // --- PROFIT MONITOR ---
    async runProfitMonitor() {
        if (!this.system.activePosition || !this.wallets['ETHEREUM']) return;
        this.system.isLocked = true;

        try {
            const pos = this.system.activePosition;
            const details = await this.ai.enrichTokenData(pos.address);
            const currentPrice = details ? details.priceUsd : "Unknown";
            console.log(`[MONITOR] ${pos.symbol} @ $${currentPrice}...`.gray);
            
            // Auto-Sell Logic would go here. 
            // For stability, we wait for Manual /sell or a timer
        } catch(e) {}
        
        finally {
            this.system.isLocked = false;
            // Check every 5s if we still hold the position
            if(this.system.activePosition) setTimeout(() => this.runProfitMonitor(), 5000);
        }
    }

    async executeSell() {
        if (!this.system.activePosition) return this.bot.sendMessage(process.env.CHAT_ID, "⚠️ No position.");
        const pos = this.system.activePosition;
        const wallet = this.wallets['ETHEREUM'];

        const token = new ethers.Contract(pos.address, ["function balanceOf(address) view returns (uint)", "function approve(address, uint) returns (bool)"], wallet);
        const bal = await token.balanceOf(wallet.address);
        
        if (bal <= 0n) return this.bot.sendMessage(process.env.CHAT_ID, "⚠️ Zero Balance.");

        console.log(`[SELL] Approving ${pos.symbol}...`.yellow);
        await (await token.approve(ROUTER_ADDR, bal)).wait();
        
        const details = await this.ai.enrichTokenData(pos.address);
        
        this.executeStrike({ 
            ticker: pos.address, 
            amount: bal, 
            symbol: pos.symbol,
            name: pos.name,
            price: details ? details.priceUsd : "Unknown"
        }, "SELL");
    }

    // --- TELEGRAM LISTENERS ---
    setupTelegramListeners() {
        this.bot.onText(/\/start/, (msg) => {
            process.env.CHAT_ID = msg.chat.id;
            this.bot.sendMessage(msg.chat.id, `🦁 **APEX PREDATOR v1200.0**\n\nCommands:\n/connect <key>\n/auto (Toggle Auto-Pilot)\n/scan (Manual Scan)\n/buy <addr> (Manual Buy)\n/approve (Execute Pending)\n/sell (Panic Sell)\n/settings`);
        });

        this.bot.onText(/\/connect\s+(.+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            try { await this.bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
            const address = await this.connectWallet(match[1]);
            if (address) this.bot.sendMessage(chatId, `✅ **CONNECTED:** \`${address}\``, {parse_mode: "Markdown"});
            else this.bot.sendMessage(chatId, `❌ **FAILED**`);
        });

        this.bot.onText(/\/auto/, (msg) => {
            if (!this.wallets['ETHEREUM']) return this.bot.sendMessage(msg.chat.id, "⚠️ Connect wallet!");
            this.system.autoPilot = !this.system.autoPilot;
            this.bot.sendMessage(msg.chat.id, `🤖 **AUTOPILOT:** ${this.system.autoPilot ? "ON" : "OFF"}`);
            // Restart loop if turned ON
            if (this.system.autoPilot) this.runWebLoop();
        });

        this.bot.onText(/\/scan/, async (msg) => {
            this.bot.sendMessage(msg.chat.id, "🔎 **SCANNING...**");
            const signals = await this.ai.scanWeb();
            if (signals.length > 0) {
                const target = signals[0];
                this.system.pendingTarget = { ...target, source: "MANUAL_SCAN" };
                this.bot.sendMessage(msg.chat.id, `🎯 **FOUND:** ${target.symbol}\n⚠️ Type \`/approve\` to Buy.`);
            } else this.bot.sendMessage(msg.chat.id, "❌ No signals.");
        });

        this.bot.onText(/\/approve/, (msg) => {
            if (!this.system.pendingTarget) return this.bot.sendMessage(msg.chat.id, "⚠️ No pending target.");
            // Source = MANUAL -> Bypasses rotation check
            this.executeStrike({ ...this.system.pendingTarget, source: "MANUAL" }, "BUY");
            this.system.pendingTarget = null;
        });

        this.bot.onText(/\/buy\s+(.+)/i, async (msg, match) => {
            const addr = match[1];
            if (!this.wallets['ETHEREUM']) return this.bot.sendMessage(msg.chat.id, "⚠️ Connect wallet!");
            if (!ethers.isAddress(addr)) return this.bot.sendMessage(msg.chat.id, "❌ Invalid Address");

            this.bot.sendMessage(msg.chat.id, `🚨 **MANUAL BUY:** ${addr}`);
            const details = await this.ai.enrichTokenData(addr);
            
            // Source = COMMAND -> Bypasses rotation check
            this.executeStrike({ 
                ticker: addr, 
                symbol: details ? details.symbol : "MANUAL", 
                name: details ? details.name : "Unknown",
                price: details ? details.priceUsd : "0",
                source: "COMMAND" 
            }, "BUY");
        });

        this.bot.onText(/\/sell/, (msg) => this.executeSell());

        this.bot.onText(/\/manual/, (msg) => {
            this.system.autoPilot = false;
            this.bot.sendMessage(msg.chat.id, "🕹️ **MANUAL MODE**");
            if (this.system.activePosition) this.runProfitMonitor();
        });

        this.bot.onText(/\/status/, async (msg) => {
            if (!this.wallets['ETHEREUM']) return this.bot.sendMessage(msg.chat.id, "⚠️ No wallet.");
            const bal = await this.providers.ETHEREUM.getBalance(this.wallets.ETHEREUM.address);
            this.bot.sendMessage(msg.chat.id, `📡 **STATUS**\n💰 **ETH:** ${ethers.formatEther(bal)}\n🎒 **Pos:** ${this.system.activePosition?.symbol || "None"}`);
        });
        
        this.bot.onText(/\/restart/, (msg) => {
            this.system.autoPilot = false;
            this.system.activePosition = null;
            this.system.pendingTarget = null;
            this.bot.sendMessage(msg.chat.id, `♻️ **RESET**`);
        });
        
        this.bot.onText(/\/settings/, (msg) => {
             this.bot.sendMessage(msg.chat.id, `⚙️ **SETTINGS**\nTrade Amount: ${this.system.tradeAmount} ETH\nRisk: ${this.system.riskProfile}`);
        });
        
        this.bot.onText(/\/amount\s+(.+)/i, (msg, match) => {
            this.system.tradeAmount = match[1];
            this.bot.sendMessage(msg.chat.id, `✅ Amount: ${match[1]} ETH`);
        });
    }
}

// ==========================================
// 4. IGNITION
// ==========================================
http.createServer((req, res) => { res.writeHead(200); res.end("APEX_ALIVE"); }).listen(process.env.PORT || 8080);
const governor = new ApexOmniGovernor();
console.log(`🦁 APEX PREDATOR v1200.0 INITIALIZED`.magenta);
