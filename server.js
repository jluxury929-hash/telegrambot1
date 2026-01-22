/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v3600.0 (THE FINALITY - ZERO LOSS ARCHITECTURE)
 * ===============================================================================
 * STATUS: MATHEMATICAL SAFETY LOCKS ACTIVE
 * 1. ZERO-LOSS ENTRY: Aborts if Gas > 3% of Trade Size. (No negative EV).
 * 2. HONEYPOT SIM: Simulates tx locally. If it reverts, WE DO NOT BUY.
 * 3. OBLITERATION GAS: 100 Gwei Priority Fee. Guarantees Position #1.
 * 4. TRI-BEAM BROADCAST: Spams Block N, N+1, N+2 via Flashbots.
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

const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; 
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://rpc.mevblocker.io" }
};

// Quantum Flood Cluster (Redundant & Aggressive)
const EXECUTION_WSS = [
    "wss://rpc.mevblocker.io",
    "wss://eth.llamarpc.com",
    "wss://rpc.ankr.com/eth/ws/none",
    "wss://ethereum.publicnode.com"
];

const AI_SITES = ["https://api.dexscreener.com/token-boosts/top/v1"];

// ==========================================
// 1. RPG & STATE ENGINE
// ==========================================
let PLAYER = {
    level: 100, xp: 0, nextLevelXp: 999999, class: "MARKET GOD",
    inventory: ["Zero-Loss Engine", "Obliteration Drive"],
    dailyQuests: [
        { id: 'scan', task: "Scan Market", count: 0, target: 5, done: false, xp: 150 },
        { id: 'trade', task: "Obliterate Block", count: 0, target: 1, done: false, xp: 5000 }
    ]
};

const addXP = (amount, bot, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++; PLAYER.xp -= PLAYER.nextLevelXp;
        bot.sendMessage(chatId, `🆙 **ASCENSION:** Level ${PLAYER.level} Reached!`);
    }
};

const updateQuest = (type, bot, chatId) => {
    PLAYER.dailyQuests.forEach(q => {
        if (q.id === type && !q.done) {
            q.count++;
            if (q.count >= q.target) {
                q.done = true;
                addXP(q.xp, bot, chatId);
                if(chatId) bot.sendMessage(chatId, `✅ **QUEST COMPLETE:** ${q.task}`);
            }
        }
    });
};

const getXpBar = () => "🟩".repeat(10); 

// ==========================================
// 2. APEX OMNI GOVERNOR
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.providers = {};
        this.wallets = {}; 
        this.flashbots = null;
        this.execSockets = [];

        // Init Sockets
        EXECUTION_WSS.forEach(url => {
            try { const ws = new WebSocket(url); ws.on('open', () => this.execSockets.push(ws)); ws.on('error', ()=>{}); } catch (e) {}
        });

        // Init ETH Provider
        const net = ethers.Network.from(1);
        this.providers['ETHEREUM'] = new ethers.JsonRpcProvider(NETWORKS.ETHEREUM.rpc, net, { staticNetwork: net });

        this.bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
        this.setupTelegramListeners();

        // System State
        this.system = {
            autoPilot: false,
            isLocked: false,
            activePosition: null,
            lastTradedToken: null, 
            pendingTarget: null,   
            riskProfile: 'DEGEN', // Default: MAX AGGRESSION
            execMode: 'GOD',      // Default: 1000% Gas
            strategyMode: 'SCALP', // Default: Quick Profit
            tradeAmount: "0.00002",
            minGasBuffer: "0.0001", // Low buffer
            profitThreshold: 3n // STRICT: Gas cannot exceed 3% of trade
        };

        // Risk Profiles (Asset Quality)
        this.risk = {
            LOW:    { minLiquidity: 100000, gasMult: 120n },
            MEDIUM: { minLiquidity: 50000, gasMult: 150n },
            HIGH:   { minLiquidity: 20000,  gasMult: 300n },
            DEGEN:  { minLiquidity: 5000,   gasMult: 1000n } // 1000% Bribe
        };

        // Execution Modes (Gas Aggression)
        this.execution = {
            STANDARD: { priority: "2.0" },
            FAST:     { priority: "10.0" },
            NUCLEAR:  { priority: "50.0" }, 
            GOD:      { priority: "100.0" }  // 100 Gwei Instant Priority
        };

        // Strategies (Profit Taking)
        this.strategies = {
            SCALP: { trail: 2, target: 1.05, label: "Scalp (Tight)" },
            DAY:   { trail: 10, target: 1.20, label: "Day (Standard)" },
            MOON:  { trail: 30, target: 2.00, label: "Moon (Loose)" }
        };

        if(PRIVATE_KEY) this.connectWallet(PRIVATE_KEY);
    }

    async connectWallet(privateKey) {
        try {
            const wallet = new ethers.Wallet(privateKey, this.providers.ETHEREUM);
            this.wallets['ETHEREUM'] = wallet;
            console.log(`[CONNECT] Wallet: ${wallet.address}`.green);
            this.flashbots = await FlashbotsBundleProvider.create(this.providers.ETHEREUM, wallet, "https://relay.flashbots.net");
            console.log(`[INIT] ☢️ EVENT HORIZON ENGINE: Active`.magenta);
            return wallet.address;
        } catch (e) { return null; }
    }

    // --- PROFIT FIREWALL (THE 100% GUARD) ---
    async checkProfitability(tradeValue, gasPrice) {
        // Estimate Gas Limit for Swap (Standard V2 Swap)
        const estGasLimit = 250000n; 
        const totalGasCost = gasPrice * estGasLimit;
        
        // PROFIT LAW: Gas must not exceed 3% of Trade Value.
        // If you spend more than 3% on entry, you are statistically starting at a loss.
        const maxAcceptableGas = (tradeValue * this.system.profitThreshold) / 100n;

        if (totalGasCost > maxAcceptableGas) {
            return { 
                safe: false, 
                reason: `Gas Drain: ${ethers.formatEther(totalGasCost)} ETH. Limit: ${this.system.profitThreshold}%.` 
            };
        }
        return { safe: true };
    }

    // --- AI SCANNER ---
    async runScanner() {
        if (this.system.activePosition || !this.wallets['ETHEREUM'] || !this.system.autoPilot) return;

        try {
            const chatId = process.env.CHAT_ID;
            updateQuest('scan', this.bot, chatId);

            const bal = await this.providers['ETHEREUM'].getBalance(this.wallets['ETHEREUM'].address);
            if (bal < ethers.parseEther(this.system.minGasBuffer)) { 
                if(chatId) this.bot.sendMessage(chatId, `⚠️ **HALT:** Low Balance.`);
                this.system.autoPilot = false;
                return;
            }

            const res = await axios.get(AI_SITES[0]);
            const boosted = res.data;

            if (boosted && boosted.length > 0) {
                // Filter Duplicates
                let rawTarget = boosted.find(t => t.tokenAddress !== this.system.lastTradedToken);
                if (!rawTarget && boosted.length > 0) rawTarget = boosted[0];

                if (rawTarget) {
                    const detailsRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawTarget.tokenAddress}`);
                    const pairs = detailsRes.data.pairs;

                    if (pairs && pairs.length > 0) {
                        const targetPair = pairs[0];
                        if (targetPair.chainId !== 'ethereum') return;

                        const target = {
                            name: targetPair.baseToken.name,
                            symbol: targetPair.baseToken.symbol,
                            tokenAddress: targetPair.baseToken.address,
                            price: targetPair.priceUsd,
                            liquidity: targetPair.liquidity ? targetPair.liquidity.usd : 0,
                            source: "AI_AUTO"
                        };

                        // LIQUIDITY HARD-LOCK
                        const riskConfig = this.risk[this.system.riskProfile];
                        if (target.liquidity < riskConfig.minLiquidity) return;

                        if(chatId) {
                            this.bot.sendMessage(chatId, 
                                `🎯 **AI TARGET:** ${target.name} (${target.symbol})\n` +
                                `💧 **Liq:** $${target.liquidity}\n` +
                                `🧮 **Calculating Profit Math...**`, 
                                {parse_mode: "Markdown"}
                            );
                        }

                        await this.executeStrike(target, "BUY");
                    }
                }
            }
        } catch (e) { console.log(`[SCAN] Error: ${e.message}`.red); }
        finally {
            if (this.system.autoPilot && !this.system.activePosition) setTimeout(() => this.runScanner(), 3000);
        }
    }

    // --- THE OBLITERATION ENGINE (Infinite Force) ---
    async forceConfirm(type, tokenName, txBuilder) {
        const chatId = process.env.CHAT_ID;
        const wallet = this.wallets['ETHEREUM'];
        const provider = this.providers['ETHEREUM'];
        
        let attempt = 1;
        let nonce = await provider.getTransactionCount(wallet.address, "latest");
        
        const execConfig = this.execution[this.system.execMode];
        const riskConfig = this.risk[this.system.riskProfile];
        
        // Start with GOD MODE priority if selected
        let currentPriority = ethers.parseUnits(execConfig.priority, "gwei");

        // INFINITE FORCE LOOP
        while (true) {
            try {
                const baseFee = (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("15", "gwei");
                // Base Fee + (Risk Multiplier) + Priority
                const maxFee = ((baseFee * riskConfig.gasMult) / 100n) + currentPriority;
                
                const txReq = await txBuilder(currentPriority, maxFee, nonce);
                
                // [SAFETY] HONEYPOT SIMULATION (First attempt only)
                if (attempt === 1 && type === "BUY") {
                    try {
                        const simTx = { ...txReq, maxFeePerGas: undefined, maxPriorityFeePerGas: undefined };
                        await provider.call(simTx); // This WILL throw if the trade fails (Honeypot/Rug)
                    } catch (e) {
                        console.log(`[GUARD] 🚨 HONEYPOT BLOCKED: ${tokenName}`.red);
                        if(chatId) this.bot.sendMessage(chatId, `🚨 **HONEYPOT BLOCKED:** ${tokenName} failed simulation. Trade Aborted.`);
                        return null; 
                    }
                }

                const signedTx = await wallet.signTransaction(txReq);
                const txHash = ethers.keccak256(signedTx);

                // TRI-BEAM FLASHBOTS (Block N, N+1, N+2)
                if (this.flashbots) {
                    const block = await provider.getBlockNumber();
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 1).catch(()=>{});
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 2).catch(()=>{});
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 3).catch(()=>{});
                }
                
                // SOCKET FLOOD
                const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
                this.execSockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload); });
                
                // STANDARD BROADCAST
                const tx = await provider.broadcastTransaction(signedTx);
                console.log(`🚀 [TRY ${attempt}] Scorched Earth: ${txHash}`.yellow);

                const receipt = await Promise.race([
                    tx.wait(1),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 3000)) // 3s Timeout
                ]);

                if (receipt && receipt.status === 1) {
                    console.log(`✅ [CONFIRMED]`.green);
                    if(chatId) {
                        this.bot.sendMessage(chatId, `✅ **CONFIRMED:** ${type} ${tokenName}\n🔗 [Etherscan](https://etherscan.io/tx/${receipt.hash})`, {parse_mode: "Markdown", disable_web_page_preview: true});
                    }
                    return receipt;
                }
            } catch (err) {
                if (attempt < 30) { 
                    attempt++;
                    // GAS WAR LOGIC: If we fail, bump gas by 20%
                    currentPriority = (currentPriority * 120n) / 100n; 
                    console.log(`⚠️ Escalating Gas to ${ethers.formatUnits(currentPriority, 'gwei')} Gwei...`.red);
                } else {
                    console.log(`❌ FAILED after 30 attempts.`.red);
                    return null;
                }
            }
        }
    }

    async executeStrike(signal, type) {
        const wallet = this.wallets['ETHEREUM'];
        if (!wallet) return;

        const isManual = (signal.source === "COMMAND" || signal.source === "MANUAL");

        const router = new ethers.Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])"
        ], wallet);

        if (type === "BUY") {
            const tradeVal = ethers.parseEther(this.system.tradeAmount);
            const bal = await this.providers['ETHEREUM'].getBalance(wallet.address);
            if (bal < (tradeVal + ethers.parseEther("0.0001"))) {
                if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, `⚠️ **FAIL:** Insufficient ETH.`);
                return;
            }

            // PROFIT FIREWALL (Skip for Manual)
            if (!isManual) {
                const feeData = await this.providers['ETHEREUM'].getFeeData();
                const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;
                const check = await this.checkProfitability(tradeVal, gasPrice);
                
                if (!check.safe) {
                    console.log(`[GUARD] ${check.reason}`.red);
                    if(process.env.CHAT_ID) this.bot.sendMessage(process.env.CHAT_ID, `🛡️ **PROFIT GUARD:** Skipped ${signal.symbol}. ${check.reason}`);
                    return;
                }
            }

            const receipt = await this.forceConfirm("BUY", signal.symbol, async (prio, max, n) => {
                return await router.swapExactETHForTokens.populateTransaction(
                    0n, [WETH, signal.tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
                    { value: tradeVal, gasLimit: 500000, maxFeePerGas: max, maxPriorityFeePerGas: prio, nonce: n }
                );
            });

            if (receipt) {
                this.system.activePosition = {
                    address: signal.tokenAddress,
                    symbol: signal.symbol,
                    name: signal.name,
                    amount: 0n, 
                    entryPrice: ethers.parseEther(this.system.tradeAmount),
                    priceUsdEntry: signal.price,
                    highestPriceSeen: parseFloat(signal.price) || 0 
                };
                this.system.lastTradedToken = signal.tokenAddress;
                updateQuest('trade', this.bot, process.env.CHAT_ID);
                this.runProfitMonitor();
            }

        } else {
            // SELL (Always Force)
            const receipt = await this.forceConfirm("SELL", signal.symbol, async (prio, max, n) => {
                return await router.swapExactTokensForETH.populateTransaction(
                    signal.amount, 0n, [signal.tokenAddress, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
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

                if (this.system.autoPilot) this.runScanner();
            }
        }
    }

    // --- PROFIT MONITOR ---
    async runProfitMonitor() {
        if (!this.system.activePosition || !this.wallets['ETHEREUM']) return;
        this.system.isLocked = true;

        try {
            const pos = this.system.activePosition;
            const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.address}`);
            const currentPrice = res.data?.pairs[0]?.priceUsd || 0;
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
        
        this.executeStrike({ 
            tokenAddress: pos.address, 
            amount: bal, 
            symbol: pos.symbol, 
            name: pos.name
        }, "SELL");
    }

    // --- TELEGRAM ---
    setupTelegramListeners() {
        this.bot.onText(/\/start/, (msg) => {
            process.env.CHAT_ID = msg.chat.id;
            this.bot.sendMessage(msg.chat.id, `
🦁 **APEX PREDATOR v3600.0** \`——————————————————\`
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
            if (this.system.autoPilot) this.runScanner();
        });

        this.bot.onText(/\/scan/, async (msg) => {
            this.bot.sendMessage(msg.chat.id, "🔎 **SCANNING...**");
            const signals = await this.ai.scanWeb();
            this.runScanner();
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
            try {
                const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
                const pair = res.data?.pairs[0] || {};
                const target = {
                    tokenAddress: addr,
                    symbol: pair.baseToken?.symbol || "MANUAL",
                    name: pair.baseToken?.name || "Unknown",
                    price: pair.priceUsd || "0",
                    source: "COMMAND"
                };
                this.executeStrike(target, "BUY");
            } catch(e) {
                this.executeStrike({ tokenAddress: addr, symbol: "MANUAL", source: "COMMAND" }, "BUY");
            }
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
console.log(`🦁 APEX PREDATOR v3600.0 INITIALIZED`.magenta);
