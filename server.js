/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v2300.0 (OMNI-FORCE: STABLE CORE)
 * ===============================================================================
 * STATUS: CRITICAL FIXES APPLIED
 * 1. FIX: Resolved "this.ai.scanWeb is not a function" crash.
 * 2. AUTO-PILOT: Robust loop scans web signals + Mempool Pre-Cog.
 * 3. EXECUTION: "Force Confirm" ensures trade success (Manual & Auto).
 * 4. MANUAL: /buy & /approve bypass safety checks for instant entry.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
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

// Router
const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; 
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Network
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
    inventory: ["Force Gauntlet", "AI Core"],
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
                    priceUsd: pair.priceUsd,
                    liquidity: pair.liquidity ? pair.liquidity.usd : 0,
                    fdv: pair.fdv || 0
                };
            }
        } catch (e) { return null; }
        return { name: "Unknown", symbol: "???", priceUsd: "0.00", liquidity: 0, fdv: 0 };
    }

    // --- WEB SCANNER (FIXED: Returns Signals Array) ---
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
                                // RISK FILTER
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
                source: "MEMPOOL"
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
            riskProfile: 'MEDIUM', 
            execMode: 'NUCLEAR',   
            strategyMode: 'DAY',   
            tradeAmount: "0.00002" 
        };

        // RISK PROFILES
        this.risk = {
            LOW:    { minLiquidity: 50000, gasMult: 110n },
            MEDIUM: { minLiquidity: 10000, gasMult: 125n },
            HIGH:   { minLiquidity: 2000,  gasMult: 150n },
            DEGEN:  { minLiquidity: 0,     gasMult: 200n } 
        };

        // EXECUTION MODES
        this.execution = {
            STANDARD: { priority: "2.0" },
            FAST:     { priority: "5.0" },
            NUCLEAR:  { priority: "20.0" }, 
            GOD:      { priority: "50.0" }  
        };

        // STRATEGIES
        this.strategies = {
            SCALP: { trail: 3, target: 1.05, label: "Scalp (3%)" },
            DAY:   { trail: 10, target: 1.20, label: "Day (10%)" },
            MOON:  { trail: 30, target: 2.00, label: "Moon (30%)" }
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

    // --- THE UNSTOPPABLE FORCE ENGINE ---
    async forceConfirm(type, tokenName, txBuilder) {
        const chatId = process.env.CHAT_ID;
        const wallet = this.wallets['ETHEREUM'];
        const provider = this.providers['ETHEREUM'];
        
        let attempt = 1;
        let nonce = await provider.getTransactionCount(wallet.address, "latest");
        
        const execConfig = this.execution[this.system.execMode];
        const riskConfig = this.risk[this.system.riskProfile];
        
        let currentPriority = ethers.parseUnits(execConfig.priority, "gwei");

        while (true) {
            try {
                const baseFee = (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("15", "gwei");
                const maxFee = ((baseFee * riskConfig.gasMult) / 100n) + currentPriority;
                
                const txReq = await txBuilder(currentPriority, maxFee, nonce);
                const signedTx = await wallet.signTransaction(txReq);
                const txHash = ethers.keccak256(signedTx);

                if (this.flashbots) {
                    const block = await provider.getBlockNumber();
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 1).catch(()=>{});
                }
                
                const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
                this.execSockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload); });
                
                const tx = await provider.broadcastTransaction(signedTx);
                console.log(`🚀 [TRY ${attempt}] Sent: ${txHash}`.yellow);

                const receipt = await Promise.race([
                    tx.wait(1),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 6000))
                ]);

                if (receipt && receipt.status === 1) {
                    console.log(`✅ [CONFIRMED]`.green);
                    if(chatId) {
                        this.bot.sendMessage(chatId, `✅ **CONFIRMED:** ${type} ${tokenName}\n🔗 [Etherscan](https://etherscan.io/tx/${receipt.hash})`, {parse_mode: "Markdown", disable_web_page_preview: true});
                    }
                    return receipt;
                }
            } catch (err) {
                if (attempt < 20) { 
                    attempt++;
                    currentPriority = (currentPriority * 120n) / 100n; 
                    console.log(`⚠️ Stuck. Bumping priority to ${ethers.formatUnits(currentPriority, 'gwei')} Gwei...`.red);
                } else {
                    console.log(`❌ FAILED after 20 attempts.`.red);
                    return null;
                }
            }
        }
    }

    async executeStrike(signal, type) {
        const wallet = this.wallets['ETHEREUM'];
        if (!wallet) return;

        // Manual Command Bypass
        const isManual = (signal.source === "COMMAND" || signal.source === "MANUAL");

        // Smart Rotation (Skipped for Manual)
        if (type === "BUY" && !isManual && this.system.lastTradedToken === signal.ticker) {
            console.log(`[SKIP] Smart Rotation: Already traded ${signal.symbol}.`.gray);
            return;
        }

        // Enrich Data if Missing
        if (!signal.name || signal.name === "Unknown") {
            const details = await this.ai.enrichTokenData(signal.ticker);
            if(details) {
                signal.name = details.name;
                signal.symbol = details.symbol;
                signal.price = details.priceUsd;
            }
        }

        const router = new ethers.Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])"
        ], wallet);

        if (type === "BUY") {
            const tradeVal = ethers.parseEther(this.system.tradeAmount);
            // ⚠️ 0.0001 ETH Buffer Check
            const bal = await this.providers['ETHEREUM'].getBalance(wallet.address);
            if (bal < (tradeVal + ethers.parseEther("0.0001"))) {
                if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, `⚠️ **FAIL:** Insufficient ETH (Need Trade + 0.0001 Gas).`);
                return;
            }

            // FORCE CONFIRM LOOP
            const receipt = await this.forceConfirm("BUY", signal.symbol, async (prio, max, n) => {
                return await router.swapExactETHForTokens.populateTransaction(
                    0n, [WETH, signal.ticker], wallet.address, Math.floor(Date.now()/1000)+120,
                    { value: tradeVal, gasLimit: 500000, maxFeePerGas: max, maxPriorityFeePerGas: prio, nonce: n }
                );
            });

            if (receipt) {
                this.system.activePosition = {
                    address: signal.ticker,
                    symbol: signal.symbol,
                    name: signal.name,
                    amount: 0n, 
                    entryPrice: ethers.parseEther(this.system.tradeAmount),
                    priceUsdEntry: signal.price,
                    highestPriceSeen: parseFloat(signal.price) || 0 
                };
                this.system.lastTradedToken = signal.ticker;
                updateQuest('trade', this.bot, process.env.CHAT_ID);
                this.runProfitMonitor();
            }

        } else {
            // SELL
            const receipt = await this.forceConfirm("SELL", signal.symbol, async (prio, max, n) => {
                return await router.swapExactTokensForETH.populateTransaction(
                    signal.amount, 0n, [signal.ticker, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
                    { gasLimit: 500000, maxFeePerGas: max, maxPriorityFeePerGas: prio, nonce: n }
                );
            });

            if (receipt) {
                this.system.activePosition = null;
                addXP(1000, this.bot, process.env.CHAT_ID);
                updateQuest('trade', this.bot, process.env.CHAT_ID);
                
                this.bot.sendMessage(process.env.CHAT_ID, 
                        `💰 **PROFIT SECURED: ${signal.name}**\n` +
                        `💵 **Exit:** $${signal.price}\n` +
                        `🔄 **ROTATING FUNDS TO NEXT TARGET...**`,
                        {parse_mode: "Markdown"}
                );

                // RESTART SCANNER (The Eternal Cycle)
                if (this.system.autoPilot) this.runWebLoop();
            }
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
        
        try {
            // 🛠️ FIX: Correctly call scanWeb on this.ai
            const signals = await this.ai.scanWeb();
            if (signals.length > 0) {
                const target = signals[0];
                if (target.ticker !== this.system.lastTradedToken) {
                    this.processSignal(target);
                }
            }
        } catch(e) { console.log(e); }

        if (!this.system.activePosition && this.system.autoPilot) setTimeout(() => this.runWebLoop(), 3000);
    }

    // --- PROFIT MONITOR & AUTO-SELL ---
    async runProfitMonitor() {
        if (!this.system.activePosition || !this.wallets['ETHEREUM']) return;
        this.system.isLocked = true;

        try {
            const pos = this.system.activePosition;
            const details = await this.ai.enrichTokenData(pos.address);
            const currentPrice = details ? parseFloat(details.priceUsd) : 0;
            const highestPrice = pos.highestPriceSeen || 0;

            if (currentPrice > 0) {
                if (currentPrice > highestPrice) this.system.activePosition.highestPriceSeen = currentPrice;
                const dropPct = ((this.system.activePosition.highestPriceSeen - currentPrice) / this.system.activePosition.highestPriceSeen) * 100;
                const strat = this.strategies[this.system.strategyMode];
                
                console.log(`[MONITOR] ${pos.symbol}: $${currentPrice} | Drop: ${dropPct.toFixed(2)}% | Limit: ${strat.trail}%`.gray);

                if (dropPct >= strat.trail) {
                    if (this.system.autoPilot) {
                        this.bot.sendMessage(process.env.CHAT_ID, `📉 **TRAILING STOP:** Selling ${pos.symbol}...`);
                        await this.executeSell();
                        return; 
                    } else {
                        this.bot.sendMessage(process.env.CHAT_ID, `🚨 **ALERT:** ${pos.symbol} Drop! Suggest \`/sell\`.`);
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
🦁 **APEX PREDATOR v2300.0** \`——————————————————\`
👤 **OPERATOR:** ${msg.from.first_name}
🎖️ **RANK:** ${PLAYER.class}
📊 **XP:** ${getXpBar()} ${PLAYER.xp}/${PLAYER.nextLevelXp}

**COMMANDS:**
\`/connect <key>\` - Link Wallet
\`/scan\` - AI Scan
\`/auto\` - Toggle Autopilot
\`/buy <addr>\` - Manual Buy (Forced)
\`/approve\` - Execute Pending (Forced)
\`/sell\` - Panic Sell (Forced)
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
             this.bot.sendMessage(msg.chat.id, `⚙️ **SETTINGS**\nAmount: ${this.system.tradeAmount} ETH\nRisk: ${this.system.riskProfile}\nStrat: ${this.system.strategyMode}`);
        });
        
        this.bot.onText(/\/amount\s+(.+)/i, (msg, match) => {
            this.system.tradeAmount = match[1];
            this.bot.sendMessage(msg.chat.id, `✅ Amount: ${match[1]} ETH`);
        });

        this.bot.onText(/\/risk\s+(.+)/i, (msg, match) => {
            const val = match[1].toUpperCase();
            if (this.risk[val]) { this.system.riskProfile = val; this.bot.sendMessage(msg.chat.id, `✅ Risk Profile: ${val}`); }
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
console.log(`🦁 APEX PREDATOR v2300.0 INITIALIZED`.magenta);
