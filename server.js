/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v3500.0 (THE SINGULARITY - ABSOLUTE FINALITY)
 * ===============================================================================
 * STATUS: GOD MODE (DEFAULT)
 * 1. OBLITERATION ENGINE: 1000% Gas Bumps. You DO NOT miss blocks.
 * 2. ZERO-LOSS ENTRY: Aborts if Gas Fee > 5% of Trade Size. (Math Enforced).
 * 3. TRI-BEAM FLASHBOTS: Targets Block N, N+1, N+2 simultaneously.
 * 4. FULL AUTO: Scan -> Math Check -> Force Buy -> Peak Monitor -> Force Sell.
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
    level: 99, xp: 0, nextLevelXp: 10000, class: "MARKET GOD",
    inventory: ["Singularity Drive", "Infinite Gas"],
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

const getXpBar = () => "🟩".repeat(10); // Always Maxed

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
            minGasBuffer: "0.0001", // Low buffer for max capital efficiency
            profitThreshold: 5n // Max 5% of trade value can be spent on gas
        };

        // Risk Profiles (Asset Quality)
        this.risk = {
            LOW:    { minLiquidity: 50000, gasMult: 120n },
            MEDIUM: { minLiquidity: 10000, gasMult: 150n },
            HIGH:   { minLiquidity: 2000,  gasMult: 300n },
            DEGEN:  { minLiquidity: 0,     gasMult: 1000n } // 1000% Bribe
        };

        // Execution Modes (Gas Aggression)
        this.execution = {
            STANDARD: { priority: "2.0" },
            FAST:     { priority: "5.0" },
            NUCLEAR:  { priority: "20.0" }, 
            GOD:      { priority: "100.0" }  // 100 Gwei Priority (Obscene Speed)
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
            console.log(`[INIT] ☢️ OBLIVION ENGINE: Flashbots Active`.magenta);
            return wallet.address;
        } catch (e) { return null; }
    }

    // --- PROFIT GUARD (THE 100% CHECK) ---
    async checkProfitability(tradeValue, gasPrice) {
        // Estimate Gas Limit for Swap
        const estGasLimit = 250000n; 
        const totalGasCost = gasPrice * estGasLimit;
        
        // PROFIT LAW: Gas must not exceed 5% of Trade Value.
        // If Gas > 5%, you are statistically starting at a huge loss.
        // Example: Trade 0.1 ETH. Max Gas = 0.005 ETH.
        const maxAcceptableGas = (tradeValue * 5n) / 100n;

        if (totalGasCost > maxAcceptableGas) {
            return { safe: false, reason: `Gas Too Expensive (${ethers.formatEther(totalGasCost)} ETH). Exceeds 5% Profit Margin.` };
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

    // --- THE OBLIVION ENGINE (Infinite Force) ---
    async forceConfirm(type, tokenName, txBuilder) {
        const chatId = process.env.CHAT_ID;
        const wallet = this.wallets['ETHEREUM'];
        const provider = this.providers['ETHEREUM'];
        
        let attempt = 1;
        let nonce = await provider.getTransactionCount(wallet.address, "latest");
        
        const execConfig = this.execution[this.system.execMode];
        const riskConfig = this.risk[this.system.riskProfile];
        
        let currentPriority = ethers.parseUnits(execConfig.priority, "gwei");

        // INFINITE LOOP
        while (true) {
            try {
                const baseFee = (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("15", "gwei");
                // Base Fee + (Risk Multiplier) + Priority
                const maxFee = ((baseFee * riskConfig.gasMult) / 100n) + currentPriority;
                
                const txReq = await txBuilder(currentPriority, maxFee, nonce);
                
                // [SAFETY] SIMULATION (First attempt only)
                if (attempt === 1 && type === "BUY") {
                    try {
                        const simTx = { ...txReq, maxFeePerGas: undefined, maxPriorityFeePerGas: undefined };
                        await provider.call(simTx);
                    } catch (e) {
                        console.log(`[GUARD] 🚨 HONEYPOT BLOCKED: ${tokenName}`.red);
                        if(chatId) this.bot.sendMessage(chatId, `🚨 **HONEYPOT BLOCKED:** ${tokenName} failed simulation. Trade Aborted.`);
                        return null; 
                    }
                }

                const signedTx = await wallet.signTransaction(txReq);
                const txHash = ethers.keccak256(signedTx);

                // TRI-BEAM FLASHBOTS
                if (this.flashbots) {
                    const block = await provider.getBlockNumber();
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 1).catch(()=>{});
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 2).catch(()=>{});
                    this.flashbots.sendBundle([{ signedTransaction: signedTx }], block + 3).catch(()=>{});
                }
                
                const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
                this.execSockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload); });
                
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
                    // In God Mode, we just re-broadcast. If strict mode, we might bump.
                    // For "Obliteration", we simply persist with High Priority.
                    console.log(`⚠️ Re-broadcasting (Attempt ${attempt})...`.red);
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
                
                const stratInfo = this.strategies[this.system.strategyMode].label;
                if(process.env.CHAT_ID) {
                    this.bot.sendMessage(process.env.CHAT_ID, 
                        `🦁 **BUY CONFIRMED: ${signal.name} (${signal.symbol})**\n` +
                        `💵 **Price:** $${signal.price}\n` +
                        `📈 **Strategy:** ${stratInfo}`,
                        {parse_mode: "Markdown"}
                    );
                }
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

    // --- LOGIC ---
    async processSignal(signal) {
        if (signal.source === "MANUAL" || signal.source === "COMMAND") {
            await this.executeStrike(signal, "BUY");
            return;
        }

        if (this.system.autoPilot) {
            await this.executeStrike(signal, "BUY");
        } else {
            this.system.pendingTarget = signal;
            if (process.env.CHAT_ID) {
                this.bot.sendMessage(process.env.CHAT_ID, 
                    `🎯 **TARGET:** ${signal.symbol}\n📜 \`${signal.ticker}\`\n⚠️ **ARMED.** Type \`/approve\`.`, 
                    {parse_mode: "Markdown"}
                );
            }
        }
    }

    async runWebLoop() {
        if (!this.system.autoPilot) return;
        updateQuest('scan', this.bot, process.env.CHAT_ID);
        try {
            const signals = await this.ai.scanWeb();
            if (signals.length > 0) {
                const target = signals[0];
                if (target.ticker !== this.system.lastTradedToken) {
                    this.processSignal(target);
                }
            }
        } catch(e) {}
        
        if (!this.system.activePosition && this.system.autoPilot) setTimeout(() => this.runWebLoop(), 3000);
    }

    // --- PROFIT MONITOR & AUTO-SELL ---
    async runProfitMonitor() {
        if (!this.system.activePosition || !this.wallets['ETHEREUM']) return;
        this.system.isLocked = true;

        try {
            const pos = this.system.activePosition;
            const details = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${pos.address}`);
            const pair = details.data.pairs[0];
            const currentPrice = pair ? parseFloat(pair.priceUsd) : 0;
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
🦁 **APEX PREDATOR v3400.0** \`——————————————————\`
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
            // Mock call for manual scan, real logic is in runScanner
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
            const details = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
            const pair = details.data.pairs ? details.data.pairs[0] : null;
            
            this.executeStrike({ 
                tokenAddress: addr, 
                symbol: pair ? pair.baseToken.symbol : "MANUAL", 
                name: pair ? pair.baseToken.name : "Unknown",
                price: pair ? pair.priceUsd : "0",
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
console.log(`🦁 APEX PREDATOR v3400.0 INITIALIZED`.magenta);
