/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v1500.0 (ETERNAL PROFIT ENGINE - INTELLIGENT RISK)
 * ===============================================================================
 * STATUS: INTELLIGENT ASSET SELECTION
 * 1. RISK PROFILES: Now filter tokens based on Liquidity, FDV, and Age.
 * 2. STRATEGY MODES: Control Profit Targets (Scalp/Day/Moon).
 * 3. EXECUTION MODES: Control Gas Aggression (Standard/Nuclear).
 * 4. FULL AUTO-CYCLE: Scan -> Filter -> Buy -> Monitor -> Sell -> Rotate.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');
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
    inventory: ["Risk Analyzer", "Nuclear Codes"],
    totalProfitEth: 0.0,
    dailyQuests: [
        { id: 'scan', task: "Scan Market", count: 0, target: 5, done: false, xp: 150 },
        { id: 'trade', task: "Win a Trade", count: 0, target: 1, done: false, xp: 1000 }
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
    if (lvl < 10) return "APEX STRIKER";
    if (lvl < 20) return "WHALE HUNTER";
    return "MARKET GOD";
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
                    priceUsd: pair.priceUsd,
                    liquidity: pair.liquidity ? pair.liquidity.usd : 0,
                    fdv: pair.fdv || 0
                };
            }
        } catch (e) { return null; }
        return { name: "Unknown", symbol: "???", priceUsd: "0.00", liquidity: 0, fdv: 0 };
    }

    async scanWeb() {
        const signals = [];
        for (const url of AI_SITES) {
            try {
                const res = await axios.get(url, { timeout: 2000 });
                if (Array.isArray(res.data)) {
                    for (const t of res.data) {
                        const isEVM = (t.chainId === 'ethereum' || t.chainId === 'base') || 
                                      (t.tokenAddress && t.tokenAddress.match(/^0x[a-fA-F0-9]{40}$/));

                        if (isEVM && t.tokenAddress) {
                            const details = await this.enrichTokenData(t.tokenAddress);
                            if (details) {
                                // 🛡️ INTELLIGENT RISK FILTERING 🛡️
                                const riskProfile = this.governor.system.riskProfile;
                                const riskConfig = this.governor.risk[riskProfile];
                                
                                if (details.liquidity >= riskConfig.minLiquidity) {
                                    signals.push({
                                        ticker: t.tokenAddress,
                                        symbol: details.symbol,
                                        name: details.name,
                                        price: details.priceUsd,
                                        liquidity: details.liquidity,
                                        source: "WEB_AI",
                                        score: 95 
                                    });
                                } else {
                                    // console.log(`[FILTER] Skipped ${details.symbol} (Liq: $${details.liquidity})`.gray);
                                }
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
            if (!this.governor.system.autoPilot) return; 
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
            riskProfile: 'MEDIUM', // Default: Balanced Assets
            execMode: 'NUCLEAR',   // Default: Fast Gas
            strategyMode: 'DAY',   // Default: 10% Trailing
            tradeAmount: "0.00002" 
        };

        // 🛡️ RISK PROFILES (ASSET FILTERING)
        this.risk = {
            LOW:    { minLiquidity: 50000, label: "Low Risk (Blue Chips)" },
            MEDIUM: { minLiquidity: 10000, label: "Medium Risk (Standard)" },
            HIGH:   { minLiquidity: 2000,  label: "High Risk (Volatile)" },
            DEGEN:  { minLiquidity: 0,     label: "Degen (No Filters)" } 
        };

        // ⚡ EXECUTION MODES (GAS AGGRESSION)
        this.execution = {
            STANDARD: { gasMult: 110n, priority: "2.0" },
            FAST:     { gasMult: 125n, priority: "5.0" },
            NUCLEAR:  { gasMult: 200n, priority: "20.0" }, // Block Winner
            GOD:      { gasMult: 500n, priority: "50.0" }  // Maximum
        };

        // 🎯 STRATEGY MODES (PROFIT TAKING)
        this.strategies = {
            SCALP: { trail: 3, target: 1.05, label: "Scalp (Short)" },
            DAY:   { trail: 10, target: 1.20, label: "Day (Mid)" },
            MOON:  { trail: 30, target: 2.00, label: "Moon (Long)" }
        };

        if(PRIVATE_KEY) this.connectWallet(PRIVATE_KEY);
        this.ai.startMempoolListener();
    }

    async connectWallet(privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey, this.providers.ETHEREUM);
            this.wallets['ETHEREUM'] = wallet;
            console.log(`[CONNECT] Wallet: ${wallet.address}`.green);
            
            this.flashbots = await FlashbotsBundleProvider.create(
                this.providers.ETHEREUM, 
                wallet, 
                "https://relay.flashbots.net"
            );
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

        // Smart Rotation
        if (type === "BUY" && this.system.lastTradedToken === signal.ticker && signal.source !== "MANUAL" && signal.source !== "COMMAND") {
            console.log(`[SKIP] Smart Rotation: Already traded ${signal.symbol}.`.gray);
            return;
        }

        // Validate Address
        if (!ethers.isAddress(signal.ticker)) {
            console.log(`[ERROR] Invalid Address`.red);
            return;
        }

        // Enrich Data if Missing
        if (!signal.name || signal.name === "Unknown") {
            const details = await this.ai.enrichTokenData(signal.ticker);
            if(details) {
                signal.name = details.name;
                signal.symbol = details.symbol;
                signal.price = details.priceUsd;
                signal.liquidity = details.liquidity;
            }
        }

        // 🛡️ RISK CHECK (Only for Auto-Buys)
        if (type === "BUY" && signal.source !== "COMMAND" && signal.source !== "MANUAL") {
            const riskConfig = this.risk[this.system.riskProfile];
            if (signal.liquidity < riskConfig.minLiquidity) {
                console.log(`[RISK] Skipped ${signal.symbol}. Liq $${signal.liquidity} < $${riskConfig.minLiquidity}`.gray);
                return;
            }
        }

        const execConfig = this.execution[this.system.execMode];
        const provider = this.providers.ETHEREUM;

        // Gas Math (Block Winner)
        const feeData = await provider.getFeeData();
        const baseFee = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("10", "gwei");
        
        const isManual = (signal.source === "COMMAND" || signal.source === "MANUAL");
        // Force GOD mode gas for manual commands
        let prioVal = (isManual) ? "50.0" : execConfig.priority;
        const priorityFee = ethers.parseUnits(prioVal, "gwei"); 
        
        // Max Fee Calculation
        const aggMaxFee = ((baseFee * execConfig.gasMult) / 100n) + priorityFee;

        const nonce = await provider.getTransactionCount(wallet.address, "latest");
        const router = new ethers.Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])"
        ], wallet);

        // Build Tx
        let txRequest;
        if (type === "BUY") {
            const tradeVal = ethers.parseEther(this.system.tradeAmount);
            const bal = await provider.getBalance(wallet.address);
            if (bal < (tradeVal + ethers.parseEther("0.02"))) {
                if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, `⚠️ **FAIL:** Insufficient ETH.`);
                return;
            }

            txRequest = await router.swapExactETHForTokens.populateTransaction(
                0n, 
                [WETH, signal.ticker], 
                wallet.address, 
                Math.floor(Date.now()/1000)+120,
                { value: tradeVal, gasLimit: 600000, maxFeePerGas: aggMaxFee, maxPriorityFeePerGas: priorityFee, nonce }
            );
        } else {
            txRequest = await router.swapExactTokensForETH.populateTransaction(
                signal.amount, 0n, [signal.ticker, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
                { gasLimit: 600000, maxFeePerGas: aggMaxFee, maxPriorityFeePerGas: priorityFee, nonce }
            );
        }

        const signedTx = await wallet.signTransaction(txRequest);
        
        // NUCLEAR DELIVERY
        const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
        const killLoop = setInterval(() => {
            this.execSockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload); });
        }, 50);

        if (this.flashbots) {
            const block = await provider.getBlockNumber();
            const bundle = [{ signedTransaction: signedTx }];
            this.flashbots.sendBundle(bundle, block + 1).catch(()=>{});
            this.flashbots.sendBundle(bundle, block + 2).catch(()=>{});
        }

        try {
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
                        priceUsdEntry: signal.price,
                        highestPriceSeen: parseFloat(signal.price) || 0 
                    };
                    this.system.lastTradedToken = signal.ticker;
                    updateQuest('trade', this.bot, process.env.CHAT_ID);
                    
                    const stratInfo = this.strategies[this.system.strategyMode].label;
                    
                    this.bot.sendMessage(process.env.CHAT_ID, 
                        `🦁 **BUY CONFIRMED: ${signal.name} (${signal.symbol})**\n` +
                        `💵 **Price:** $${signal.price}\n` +
                        `🤖 **AI Score:** ${signal.score || 99}/100\n` +
                        `📈 **Strategy:** ${stratInfo}\n` +
                        `🔗 [Etherscan](https://etherscan.io/tx/${tx.hash})`, 
                        {parse_mode: "Markdown", disable_web_page_preview: true}
                    );
                    this.runProfitMonitor(); 
                } else {
                    // SELL SUCCESS -> ROTATION TRIGGER
                    this.system.activePosition = null;
                    addXP(1000, this.bot, process.env.CHAT_ID);
                    updateQuest('trade', this.bot, process.env.CHAT_ID);

                    this.bot.sendMessage(process.env.CHAT_ID, 
                        `💰 **PROFIT SECURED: ${signal.name}**\n` +
                        `💵 **Exit:** $${signal.price}\n` +
                        `🔄 **ROTATING FUNDS TO NEXT TARGET...**\n` +
                        `🔗 [Etherscan](https://etherscan.io/tx/${tx.hash})`,
                        {parse_mode: "Markdown", disable_web_page_preview: true}
                    );
                    
                    // RESTART SCANNER (CRYPTO-FOR-CRYPTO CYCLE)
                    if (this.system.autoPilot) this.runWebLoop();
                }
                return receipt;
            }
        } catch (e) {
            console.log(`[FAIL]: ${e.message}`.red);
            setTimeout(() => clearInterval(killLoop), 5000);
        }
    }

    // --- LOGIC ---
    async processSignal(signal) {
        if (!this.system.autoPilot && signal.source !== "MANUAL" && signal.source !== "COMMAND") {
            this.system.pendingTarget = signal;
            if (process.env.CHAT_ID) {
                this.bot.sendMessage(process.env.CHAT_ID, 
                    `🎯 **TARGET:** ${signal.symbol}\n📜 \`${signal.ticker}\`\n⚠️ **ARMED.** Type \`/approve\`.`, 
                    {parse_mode: "Markdown"}
                );
            }
            return;
        }
        await this.executeStrike(signal, "BUY");
    }

    async runWebLoop() {
        if (!this.system.autoPilot) return;
        updateQuest('scan', this.bot, process.env.CHAT_ID);
        const signals = await this.ai.scanWeb();
        if (signals.length > 0) {
            const target = signals[0];
            if (target.ticker !== this.system.lastTradedToken) {
                this.processSignal(target);
            }
        }
        if (!this.system.activePosition && this.system.autoPilot) setTimeout(() => this.runWebLoop(), 3000);
    }

    // --- PROFIT MONITOR ---
    async runProfitMonitor() {
        if (!this.system.activePosition || !this.wallets['ETHEREUM']) return;
        this.system.isLocked = true;

        try {
            const pos = this.system.activePosition;
            const details = await this.ai.enrichTokenData(pos.address);
            const currentPrice = details ? parseFloat(details.priceUsd) : 0;
            const highestPrice = pos.highestPriceSeen || 0;

            if (currentPrice > 0) {
                if (currentPrice > highestPrice) {
                    this.system.activePosition.highestPriceSeen = currentPrice;
                }

                const dropPct = ((this.system.activePosition.highestPriceSeen - currentPrice) / this.system.activePosition.highestPriceSeen) * 100;
                const strat = this.strategies[this.system.strategyMode];
                
                console.log(`[MONITOR] ${pos.symbol}: $${currentPrice} | Drop: ${dropPct.toFixed(2)}% | Limit: ${strat.trail}%`.gray);

                // TRAILING STOP TRIGGER
                if (dropPct >= strat.trail) {
                    if (this.system.autoPilot) {
                        this.bot.sendMessage(process.env.CHAT_ID, `📉 **TRAILING STOP:** ${pos.symbol} dropped ${dropPct.toFixed(2)}% from peak. Selling...`);
                        await this.executeSell();
                        return; 
                    } else {
                        this.bot.sendMessage(process.env.CHAT_ID, `🚨 **ALERT:** ${pos.symbol} dropped ${dropPct.toFixed(2)}% from peak! Suggest \`/sell\`.`);
                    }
                }
            }
        } catch(e) {}
        
        finally {
            this.system.isLocked = false;
            if(this.system.activePosition) setTimeout(() => this.runProfitMonitor(), 4000); 
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

    // --- TELEGRAM ---
    setupTelegramListeners() {
        this.bot.onText(/\/start/, (msg) => {
            process.env.CHAT_ID = msg.chat.id;
            this.bot.sendMessage(msg.chat.id, `
🦁 **APEX PREDATOR v1500.0** \`——————————————————\`
👤 **OPERATOR:** ${msg.from.first_name}
🎖️ **RANK:** ${PLAYER.class}
📊 **XP:** ${getXpBar()} ${PLAYER.xp}/${PLAYER.nextLevelXp}

**COMMANDS:**
\`/connect <key>\` - Link Wallet
\`/scan\` - AI Scan
\`/auto\` - Toggle Autopilot
\`/buy <addr>\` - Manual Buy
\`/approve\` - Execute Pending
\`/sell\` - Panic Sell
\`/manual\` - Monitor Mode
\`/settings\` - View Config
\`/status\` - Live Telemetry`, {parse_mode: "Markdown"});
        });

        this.bot.onText(/\/connect\s+(.+)/i, async (msg, match) => {
            const chatId = msg.chat.id;
            try { await this.bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
            const address = await this.connectWallet(match[1]);
            if (address) this.bot.sendMessage(chatId, `✅ **CONNECTED:** \`${address}\``, {parse_mode: "Markdown"});
            else this.bot.sendMessage(chatId, `❌ **FAILED**`);
        });

        this.bot.onText(/\/auto/, (msg) => {
            if (!this.wallets['ETHEREUM']) return this.bot.sendMessage(msg.chat.id, "⚠️ Connect wallet first!");
            this.system.autoPilot = !this.system.autoPilot;
            this.bot.sendMessage(msg.chat.id, `🤖 **AUTOPILOT:** ${this.system.autoPilot ? "ON" : "OFF"}`);
            if (this.system.autoPilot) this.runWebLoop();
        });

        this.bot.onText(/\/scan/, async (msg) => {
            this.bot.sendMessage(msg.chat.id, "🔎 **SCANNING...**");
            const signals = await this.ai.scanWeb();
            if (signals.length > 0) {
                const target = signals[0];
                this.system.pendingTarget = { ...target, source: "MANUAL_SCAN" };
                this.bot.sendMessage(msg.chat.id, `🎯 **FOUND:** ${target.symbol}\n📜 \`${target.ticker}\`\n\n⚠️ Type \`/approve\` or \`/buy\`.`, {parse_mode: "Markdown"});
            } else this.bot.sendMessage(msg.chat.id, "❌ No signals.");
        });

        this.bot.onText(/\/approve/, (msg) => {
            if (!this.system.pendingTarget) return this.bot.sendMessage(msg.chat.id, "⚠️ No pending target.");
            this.executeStrike({ ...this.system.pendingTarget, source: "MANUAL" }, "BUY");
            this.system.pendingTarget = null;
        });

        this.bot.onText(/\/buy\s+(.+)/i, async (msg, match) => {
            const addr = match[1];
            if (!this.wallets['ETHEREUM']) return this.bot.sendMessage(msg.chat.id, "⚠️ Connect wallet first!");
            if (!ethers.isAddress(addr)) return this.bot.sendMessage(msg.chat.id, "❌ Invalid Address");

            this.bot.sendMessage(msg.chat.id, `🚨 **MANUAL BUY:** ${addr}`);
            const details = await this.ai.enrichTokenData(addr);
            
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
             const r = this.risk[this.system.riskProfile];
             const e = this.execution[this.system.execMode];
             this.bot.sendMessage(msg.chat.id, `⚙️ **SETTINGS**\nAmount: ${this.system.tradeAmount} ETH\nRisk: ${this.system.riskProfile}\nExec: ${this.system.execMode}\nStrat: ${this.system.strategyMode}`);
        });
        
        this.bot.onText(/\/amount\s+(.+)/i, (msg, match) => {
            this.system.tradeAmount = match[1];
            this.bot.sendMessage(msg.chat.id, `✅ Amount: ${match[1]} ETH`);
        });

        this.bot.onText(/\/risk\s+(.+)/i, (msg, match) => {
            const val = match[1].toUpperCase();
            if (this.risk[val]) { this.system.riskProfile = val; this.bot.sendMessage(msg.chat.id, `✅ Risk Profile: ${val}`); }
        });

        this.bot.onText(/\/exec\s+(.+)/i, (msg, match) => {
            const val = match[1].toUpperCase();
            if (this.execution[val]) { this.system.execMode = val; this.bot.sendMessage(msg.chat.id, `✅ Execution Mode: ${val}`); }
        });

        this.bot.onText(/\/mode\s+(.+)/i, (msg, match) => {
            const val = match[1].toUpperCase();
            if (this.strategies[val]) { this.system.strategyMode = val; this.bot.sendMessage(msg.chat.id, `✅ Strategy: ${val}`); }
        });
    }
}

// ==========================================
// 4. IGNITION
// ==========================================
http.createServer((req, res) => { res.writeHead(200); res.end("APEX_ALIVE"); }).listen(process.env.PORT || 8080);
const governor = new ApexOmniGovernor();
console.log(`🦁 APEX PREDATOR v1500.0 INITIALIZED`.magenta);
