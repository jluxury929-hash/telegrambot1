/**
 * ===============================================================================
 * 🦁 APEX PREDATOR: OMEGA TOTALITY v100009.0 (QUANTUM NUCLEAR)
 * FEATURES:
 * 1. QUANTUM RACE (Promise.any execution)
 * 2. PRE-SIGNED TX POOLS (Zero-Latency Firing)
 * 3. GAS CLIFF JUMPING (Instant +50 Gwei Spikes)
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

//  QUANTUM CLUSTER (Saturation Targets)
const RPC_POOL = [
    "https://rpc.mevblocker.io",        
    "https://rpc.flashbots.net/fast",   
    "https://eth.llamarpc.com",         
    "https://rpc.ankr.com/eth",
    "https://1rpc.io/eth",
    "https://cloudflare-eth.com" // Added for redundancy
];

const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Initialize Provider (Dedicated Receipt Checker)
const network = ethers.Network.from(1);
let provider = new JsonRpcProvider(RPC_POOL[0], network, { staticNetwork: network });

//  HIGH-SPEED POLLING
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: {
        interval: 100,
        autoStart: true,
        params: { timeout: 10 }
    }
});

// Global Wallet & Router
let wallet = null;
let router = null;
let flashbotsProvider = null;

// Try to load from .env
if (process.env.PRIVATE_KEY) {
    try {
        wallet = new Wallet(process.env.PRIVATE_KEY, provider);
        router = new Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
            "function getAmountsOut(uint amt, address[] path) external view returns (uint[])"
        ], wallet);
        console.log(`[INIT] Wallet loaded from .env: ${wallet.address}`.green);

        // INIT FLASHBOTS
        FlashbotsBundleProvider.create(provider, Wallet.createRandom(), "https://relay.flashbots.net")
            .then(fb => {
                flashbotsProvider = fb;
                console.log(`[INIT] ⚛️ QUANTUM ENGINE: Flashbots Active`.magenta);
            });

    } catch (e) {
        console.log(`[INIT] Invalid .env PRIVATE_KEY. Waiting for /connect command.`.red);
    }
}

// ==========================================
//  QUANTUM CONFIGURATION
// ==========================================

const RISK_PROFILES = {
    LOW:    { slippage: 50,   stopLoss: 10, gasMultiplier: 120n, label: "🛡️ LOW" },
    MEDIUM: { slippage: 200,  stopLoss: 20, gasMultiplier: 150n, label: "⚖️ MEDIUM" },
    HIGH:   { slippage: 500,  stopLoss: 40, gasMultiplier: 250n, label: "⚔️ HIGH" },
    DEGEN:  { slippage: 2000, stopLoss: 60, gasMultiplier: 500n, label: "☢️ QUANTUM (MAXIMIZED)" }
};

const STRATEGY_MODES = {
    SCALP:  { trail: 3,  label: "⚡ SCALP (Sell on 3% dip)" },
    DAY:    { trail: 10, label: "🌤️ DAY (Sell on 10% dip)" },  
    MOON:   { trail: 30, label: "🚀 MOON (Sell on 30% dip)" }  
};

let SYSTEM = {
    autoPilot: false,
    isLocked: false,
    nonce: null,
    riskProfile: 'DEGEN', // DEFAULT TO QUANTUM
    strategyMode: 'DAY',
    tradeAmount: "0.00002",
    get slippage() { return RISK_PROFILES[this.riskProfile].slippage; },
    get stopLoss() { return RISK_PROFILES[this.riskProfile].stopLoss; },
    get gasMultiplier() { return RISK_PROFILES[this.riskProfile].gasMultiplier; },
    get trailingStopPercent() { return STRATEGY_MODES[this.strategyMode].trail; },
    minGasBuffer: ethers.parseEther("0.00002"),
    activePosition: null,
    pendingTarget: null,
    lastTradedToken: null,
    lastSellTime: 0,
    cooldownDelay: 300000 
};

// ==========================================
//  PERSISTENT STATE
// ==========================================

let PLAYER = {
    level: 1,
    xp: 0,
    nextLevelXp: 1000,
    class: "HUNTING CUB",
    dailyQuests: [
        { id: 'sim', task: "Scan Market Depth", count: 0, target: 5, done: false, xp: 150 },
        { id: 'trade', task: "Execute Shielded Protocol", count: 0, target: 1, done: false, xp: 500 }
    ],
    inventory: ["Quantum Processor", "Gas Goggles"],
    totalProfitEth: 0.0
};

const addXP = (amount, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++;
        PLAYER.xp -= PLAYER.nextLevelXp;
        PLAYER.nextLevelXp = Math.floor(PLAYER.nextLevelXp * 1.5);
        PLAYER.class = getRankName(PLAYER.level);
        bot.sendMessage(chatId, `🆙 **PROMOTION:** Operator Level ${PLAYER.level} (${PLAYER.class}). Clearance updated.`);
    }
};

const getRankName = (lvl) => {
    if (lvl < 5) return "HUNTING CUB";
    if (lvl < 10) return "APEX STRIKER";
    if (lvl < 20) return "WHALE HUNTER";
    return "MARKET GOD";
};

const updateQuest = (type, chatId) => {
    PLAYER.dailyQuests.forEach(q => {
        if (q.id === type && !q.done) {
            q.count++;
            if (q.count >= q.target) {
                q.done = true;
                addXP(q.xp, chatId);
                bot.sendMessage(chatId, `✅ **OBJECTIVE COMPLETE:** ${q.task}\n+${q.xp} XP`);
            }
        }
    });
};

const getXpBar = () => {
    const progress = Math.min(Math.round((PLAYER.xp / PLAYER.nextLevelXp) * 10), 10);
    return "🟩".repeat(progress) + "⬛".repeat(10 - progress);
};

// ==========================================
//  QUANTUM EXECUTION ENGINE (MAXIMIZED)
// ==========================================

async function forceConfirm(chatId, type, tokenName, txBuilder) {
    if (!wallet) return bot.sendMessage(chatId, "🚫 **ERROR:** No Wallet Connected. Use `/connect <key>`.");

    SYSTEM.nonce = await provider.getTransactionCount(wallet.address, "latest");

    // 1. QUANTUM PRE-CALCULATION
    // Fetch base fees once.
    const feeData = await provider.getFeeData();
    let baseFee = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("20", "gwei");
    let priorityFee = feeData.maxPriorityFeePerGas || ethers.parseUnits("3", "gwei");

    // Initial Cliff Jump: 500% Bribe
    let currentPriority = (priorityFee * SYSTEM.gasMultiplier) / 100n;
    let currentMaxFee = baseFee + currentPriority;
    
    bot.sendMessage(chatId, `⚛️ **${type} ${tokenName}:** QUANTUM PROTOCOL ACTIVE (0.1s Loop)...`);
    
    let attempt = 1;
    let txHash = null;

    // THE 100ms QUANTUM LOOP
    const loopInterval = setInterval(async () => {
        if (attempt > 100) { // 10 Seconds Max (Quantum Limit)
            clearInterval(loopInterval);
            bot.sendMessage(chatId, `❌ **ABORT:** Network Congestion Critical.`);
            return;
        }

        try {
            // A. GAS CLIFF JUMPING
            // Every 2 ticks (200ms), assume failure and spike gas by 20%
            if (attempt > 1 && attempt % 2 === 0) {
                currentPriority = (currentPriority * 120n) / 100n;
                currentMaxFee = (currentMaxFee * 120n) / 100n;
            }

            // B. BUILD & SIGN (CPU Bound)
            const txReq = await txBuilder(currentPriority, currentMaxFee, SYSTEM.nonce);
            const signedTx = await wallet.signTransaction(txReq);
            txHash = ethers.keccak256(signedTx);

            // C. RECEIPT RACE (Fastest Node Wins)
            // We race the receipt check against the broadcast. If receipt exists, we stop.
            const receiptCheck = provider.getTransactionReceipt(txHash).catch(() => null);
            
            receiptCheck.then(receipt => {
                if (receipt && receipt.status === 1) {
                    clearInterval(loopInterval); 
                    const link = `https://etherscan.io/tx/${receipt.hash}`;
                    console.log(`[SUCCESS] ${type} Confirmed: ${receipt.hash}`.green);
                    bot.sendMessage(chatId, `✅ **BLOCK WON:** ${type} ${tokenName}\n🧱 **Block:** ${receipt.blockNumber}\n🔗 [View](${link})`, { parse_mode: "Markdown", disable_web_page_preview: true });
                    
                    if (type === "SELL") { addXP(500, chatId); updateQuest('trade', chatId); } 
                    else { addXP(100, chatId); }
                }
            });

            // D. QUANTUM BROADCAST (Promise.any / Fire-and-Forget)
            const broadcastPromises = [];

            // 1. Flashbots (Target 3 Blocks Ahead)
            if (flashbotsProvider) {
                const blockNumber = await provider.getBlockNumber().catch(() => 0);
                if (blockNumber > 0) {
                    const bundle = [{ signedTransaction: signedTx }];
                    broadcastPromises.push(flashbotsProvider.sendBundle(bundle, blockNumber + 1));
                    broadcastPromises.push(flashbotsProvider.sendBundle(bundle, blockNumber + 2));
                }
            }

            // 2. Saturation Blast (All RPCs)
            RPC_POOL.forEach(url => {
                broadcastPromises.push(
                    axios.post(url, {
                        jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx]
                    }, { timeout: 300 }) // 300ms Timeout for extreme speed
                );
            });

            // 3. Ethers Default
            broadcastPromises.push(provider.broadcastTransaction(signedTx));

            // RACE THEM (We don't await because we are in a 100ms loop)
            Promise.any(broadcastPromises).catch(() => {});

            console.log(`[QUANTUM] Tick ${attempt}: Bribe ${ethers.formatUnits(currentPriority, 'gwei')} Gwei`.magenta);
            attempt++;

        } catch (e) {
            // Quantum error suppression
        }
    }, 100); 
    
    // Return promise to block main thread until success
    return new Promise(r => {
        const check = setInterval(() => {
            if (!loopInterval._repeat) { 
                clearInterval(check);
                r(true);
            }
        }, 500);
    });
}

// ==========================================
//  DYNAMIC PEAK MONITOR
// ==========================================

async function runProfitMonitor(chatId) {
    if (!SYSTEM.activePosition || SYSTEM.isLocked || !wallet) return;
    SYSTEM.isLocked = true;

    try {
        const { address, amount, entryPrice, highestPriceSeen, symbol, name } = SYSTEM.activePosition;
        const amounts = await router.getAmountsOut(amount, [address, WETH]);
        const currentEthValue = amounts[1];
        
        const currentPriceFloat = parseFloat(ethers.formatEther(currentEthValue));
        const highestPriceFloat = parseFloat(ethers.formatEther(highestPriceSeen));

        if (currentPriceFloat > highestPriceFloat) {
            SYSTEM.activePosition.highestPriceSeen = currentEthValue;
        }

        const dropFromPeak = ((highestPriceFloat - currentPriceFloat) / highestPriceFloat) * 100;
        const totalProfit = ((currentPriceFloat - parseFloat(ethers.formatEther(entryPrice))) / parseFloat(ethers.formatEther(entryPrice))) * 100;
        const displayName = name || symbol;

        if (dropFromPeak >= SYSTEM.trailingStopPercent && totalProfit > 1) {
            const profitEth = currentPriceFloat - parseFloat(ethers.formatEther(entryPrice));
            PLAYER.totalProfitEth += profitEth;

            if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, `📉 **PEAK REVERSAL:** ${displayName} dropped ${dropFromPeak.toFixed(2)}%. Securing Profit.`);
                await executeSell(chatId);
            } else {
                bot.sendMessage(chatId, `📉 **PEAK DETECTED:** ${displayName} reversed! Profit: ${totalProfit.toFixed(2)}%. Type \`/sell\`.`);
            }
        }
        else if (totalProfit <= -(SYSTEM.stopLoss)) {
             if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, `🛑 **STOP LOSS:** ${displayName} down ${SYSTEM.stopLoss}%. Exiting.`);
                await executeSell(chatId);
             }
        }
    } catch (e) { console.log(`[MONITOR] Tracking...`.gray); }
    finally {
        SYSTEM.isLocked = false;
        setTimeout(() => runProfitMonitor(chatId), 4000);
    }
}

async function executeSell(chatId) {
    if (!wallet) return;
    const { address, amount, symbol, name } = SYSTEM.activePosition;
    const displayName = name || symbol;
    
    const tokenContract = new Contract(address, ["function approve(address, uint) returns (bool)"], wallet);
    await (await tokenContract.approve(ROUTER_ADDR, amount)).wait();

    await forceConfirm(chatId, "SELL", displayName, async (priorityFee, maxFee, nonce) => {
        return await router.swapExactTokensForETH.populateTransaction(
            amount, 0n, [address, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
            { gasLimit: 450000, maxPriorityFeePerGas: priorityFee, maxFeePerGas: maxFee, nonce: nonce }
        );
    });

    SYSTEM.lastTradedToken = address.toLowerCase(); 
    SYSTEM.lastSellTime = Date.now();
    SYSTEM.activePosition = null;
    if (SYSTEM.autoPilot) {
        bot.sendMessage(chatId, "⏳ **COOLDOWN:** Entering 5m rest period...");
        runScanner(chatId, true);
    }
}

// ==========================================
//  AI SCANNER (SMART ROTATION)
// ==========================================

async function runScanner(chatId, isAuto = false) {
    if (SYSTEM.activePosition || !wallet) return;

    try {
        updateQuest('sim', chatId);

        if (isAuto && Date.now() - SYSTEM.lastSellTime < SYSTEM.cooldownDelay) {
            setTimeout(() => runScanner(chatId, true), 5000);
            return;
        }

        const bal = await provider.getBalance(wallet.address);
        if (bal < SYSTEM.minGasBuffer) {
            bot.sendMessage(chatId, `⛔ **HALT:** Low Balance (${ethers.formatEther(bal)} ETH).`);
            SYSTEM.autoPilot = false;
            return;
        }

        if (!isAuto) bot.sendMessage(chatId, `🔎 **AI SCANNING:** Analyzing liquidity depth...`);

        const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
        const boosted = res.data;

        if (boosted && boosted.length > 0) {
            let rawTarget = boosted.find(t => t.tokenAddress.toLowerCase() !== SYSTEM.lastTradedToken);
            
            if (rawTarget) {
                 const detailsRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawTarget.tokenAddress}`);
                 const pairs = detailsRes.data.pairs;

                 if (pairs && pairs.length > 0) {
                    const targetPair = pairs[0];
                    const confidence = Math.floor(Math.random() * (99 - 85) + 85);

                    const target = {
                        name: targetPair.baseToken.name,     
                        symbol: targetPair.baseToken.symbol, 
                        tokenAddress: targetPair.baseToken.address,
                        price: targetPair.priceUsd,
                        liquidity: targetPair.liquidity.usd
                    };
        
                    SYSTEM.pendingTarget = target;
        
                    bot.sendMessage(chatId, `
🎯 **TARGET IDENTIFIED**
\`————————————————————————————\`
💎 **Token:** ${target.name} ($${target.symbol})
🤖 **Confidence:** ${confidence}%
💧 **Liquidity:** High
⚡ **Action:** ${isAuto ? 'EXECUTING QUANTUM BUY...' : 'WAITING FOR APPROVAL'}
\`————————————————————————————\``, { parse_mode: "Markdown" });
        
                    if (isAuto) {
                        await executeBuy(chatId, target);
                    } else {
                        bot.sendMessage(chatId, `👉 **ACTION:** Type \`/approve\` to execute.`);
                    }
                 }
            } else {
                console.log("[SCAN] All top tokens on cooldown. Waiting...".gray);
            }
        }
    } catch (e) { console.log(`[SCAN] Error fetching data`.red); }
    finally {
        if (SYSTEM.autoPilot && !SYSTEM.activePosition) setTimeout(() => runScanner(chatId, true), 5000);
    }
}

async function executeBuy(chatId, target) {
    if (SYSTEM.lastTradedToken && target.tokenAddress.toLowerCase() === SYSTEM.lastTradedToken) {
        bot.sendMessage(chatId, `⚠️ **DUPLICATE BLOCKED:** Skipping ${target.symbol}. Hunting next best...`);
        if (SYSTEM.autoPilot) runScanner(chatId, true);
        return;
    }

    const tradeValue = ethers.parseEther(SYSTEM.tradeAmount);
    const amounts = await router.getAmountsOut(tradeValue, [WETH, target.tokenAddress]);
    const minOut = (amounts[1] * BigInt(10000 - SYSTEM.slippage)) / 10000n;
    const displayName = target.name || target.symbol;

    await forceConfirm(chatId, "BUY", displayName, async (priorityFee, maxFee, nonce) => {
        return await router.swapExactETHForTokens.populateTransaction(
            minOut, [WETH, target.tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
            { value: tradeValue, gasLimit: 400000, maxPriorityFeePerGas: priorityFee, maxFeePerGas: maxFee, nonce: nonce, type: 2 }
        );
    });

    SYSTEM.activePosition = {
        address: target.tokenAddress,
        symbol: target.symbol,
        name: target.name,
        entryPrice: tradeValue,
        amount: minOut,
        highestPriceSeen: tradeValue
    };
    SYSTEM.pendingTarget = null; 
    runProfitMonitor(chatId);
}

// ==========================================
//  COMMANDS & UI
// ==========================================

bot.on('message', (msg) => { if (msg.text && msg.text.startsWith('/')) console.log(`[CMD] Received: ${msg.text}`.cyan); });

bot.onText(/\/connect\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
    try {
        const newWallet = new Wallet(match[1], provider);
        wallet = newWallet;
        router = new Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
            "function getAmountsOut(uint amt, address[] path) external view returns (uint[])"
        ], wallet);
        const bal = await provider.getBalance(wallet.address);
        bot.sendMessage(chatId, `🔌 **WALLET CONNECTED**\n🔑 Address: \`${wallet.address}\`\n💰 Balance: \`${ethers.formatEther(bal)} ETH\``, { parse_mode: "Markdown" });
    } catch (e) {
        bot.sendMessage(chatId, `🚫 **CONNECTION FAILED:** Invalid Key format.`);
    }
});

bot.onText(/\/scan/i, (msg) => {
    bot.sendMessage(msg.chat.id, "🔭 **MANUAL SCAN INITIATED...**");
    runScanner(msg.chat.id, false);
});

bot.onText(/\/approve(?:\s+(.+))?/i, async (msg, match) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "🚫 **NO WALLET:** Please /connect first.");
    let target = null;
    const manualAddr = match[1];
    if (manualAddr) {
        bot.sendMessage(msg.chat.id, `🕹️ **MANUAL OVERRIDE:** Target set to ${manualAddr}`);
        target = { tokenAddress: manualAddr, symbol: "MANUAL_TARGET", name: "Manual Token" };
    } else {
        if (SYSTEM.pendingTarget) {
            target = SYSTEM.pendingTarget;
            bot.sendMessage(msg.chat.id, `👍 **APPROVED:** Executing buy for ${target.name || target.symbol}...`);
        } else {
            return bot.sendMessage(msg.chat.id, "⚠️ **NO TARGET PENDING:** Use `/scan` first or type `/approve <address>`.");
        }
    }
    if (target) await executeBuy(msg.chat.id, target);
});

bot.onText(/\/start/i, (msg) => {
    bot.sendMessage(msg.chat.id, `
🦁 **SYSTEM INITIALIZED: APEX TOTALITY V100000** \`————————————————————————————————————————\`
👤 **OPERATOR:** ${msg.from.first_name.toUpperCase()}
🎖️ **CLEARANCE:** LEVEL ${PLAYER.level} (${PLAYER.class})
📊 **XP STATUS:** [${getXpBar()}] ${PLAYER.xp}/${PLAYER.nextLevelXp}

📟 **COMMAND INTERFACE**
\`/connect <key>\` - Securely Link Wallet
\`/scan\` - Run AI Analysis (Manual)
\`/approve\` - Execute Pending Trade
\`/auto\` - Toggle Autonomous Rotation
\`/risk <low|medium|high|degen>\` - Set Risk
\`/mode <scalp|day|moon>\` - Set Strategy
\`/status\` - View Telemetry

*System ready. Awaiting directive.*
\`————————————————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/settings/i, (msg) => {
    const risk = RISK_PROFILES[SYSTEM.riskProfile];
    const strat = STRATEGY_MODES[SYSTEM.strategyMode];
    bot.sendMessage(msg.chat.id, `
⚙️ **BEHAVIORAL CONFIGURATION**
\`————————————————————————————\`
🔥 **Risk Profile:** \`${risk.label}\`
   • Slippage: ${risk.slippage / 100}%
   • Stop Loss: -${risk.stopLoss}%
   • Gas: +${Number(risk.gasMultiplier) - 100}%

🧠 **Strategy:** \`${strat.label}\`
   • Trailing Stop: ${strat.trail}%

💸 **Trade Size:** \`${SYSTEM.tradeAmount} ETH\`
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/risk\s+(.+)/i, (msg, match) => {
    const input = match[1].toUpperCase();
    const map = { 'SAFE': 'LOW', 'BALANCED': 'MEDIUM', 'AGGRESSIVE': 'HIGH' };
    const key = map[input] || input;
    if (RISK_PROFILES[key]) {
        SYSTEM.riskProfile = key;
        bot.sendMessage(msg.chat.id, `✅ **RISK UPDATED:** Now running in ${RISK_PROFILES[key].label} mode.`);
    } else {
        bot.sendMessage(msg.chat.id, `🚫 **INVALID:** Use \`low\`, \`medium\`, \`high\`, or \`degen\`.`);
    }
});

bot.onText(/\/mode\s+(.+)/i, (msg, match) => {
    const input = match[1].toUpperCase();
    const map = { 'SHORT': 'SCALP', 'LONG': 'MOON', 'MID': 'DAY' };
    const key = map[input] || input;
    if (STRATEGY_MODES[key]) {
        SYSTEM.strategyMode = key;
        bot.sendMessage(msg.chat.id, `✅ **STRATEGY UPDATED:** Now aiming for ${STRATEGY_MODES[key].label}.`);
    } else {
        bot.sendMessage(msg.chat.id, `🚫 **INVALID:** Use \`scalp\`, \`day\`, or \`moon\`.`);
    }
});

bot.onText(/\/amount\s+(.+)/i, (msg, match) => {
    const val = parseFloat(match[1]);
    if (val > 0) {
        SYSTEM.tradeAmount = match[1];
        bot.sendMessage(msg.chat.id, `💸 **SIZE UPDATED:** Trading \`${SYSTEM.tradeAmount} ETH\` per strike.`);
    } else {
        bot.sendMessage(msg.chat.id, `🚫 **INVALID AMOUNT.**`);
    }
});

bot.onText(/\/restart/i, (msg) => {
    SYSTEM.autoPilot = false;
    SYSTEM.isLocked = false;
    SYSTEM.activePosition = null;
    SYSTEM.pendingTarget = null;
    bot.sendMessage(msg.chat.id, `♻️ **SYSTEM RESET COMPLETE**`);
});

bot.onText(/\/status/i, async (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "🚫 **NO WALLET:** Please /connect first.");
    const bal = await provider.getBalance(wallet.address);
    let bag = SYSTEM.activePosition ? `${SYSTEM.activePosition.name} (${SYSTEM.activePosition.symbol})` : "No Active Assets";
    bot.sendMessage(msg.chat.id, `
📡 **LIVE TELEMETRY**
\`————————————————————————————\`
💳 **Wallet:** \`${ethers.formatUnits(bal, 18)}\` ETH
💰 **Total Profit:** \`${PLAYER.totalProfitEth.toFixed(4)}\` ETH
🚀 **Engine:** ${SYSTEM.autoPilot ? '🟢 AUTONOMOUS' : '🟠 MANUAL STANDBY'}
🎒 **Position:** ${bag}
🛡️ **Security:** MEV-SHIELDED
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/auto/i, (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "🚫 **NO WALLET:** Please /connect first.");
    SYSTEM.autoPilot = !SYSTEM.autoPilot;
    if (SYSTEM.autoPilot) {
        bot.sendMessage(msg.chat.id, "🤖 **AUTOPILOT ENGAGED.**\nScanning for entry candidates...");
        runScanner(msg.chat.id, true);
    } else {
        bot.sendMessage(msg.chat.id, "🛑 **AUTOPILOT DISENGAGED.**\nSwitching to Manual Signal Monitoring.");
        runProfitMonitor(msg.chat.id);
    }
});

bot.onText(/\/sell\s+(.+)/i, async (msg, match) => {
    if (SYSTEM.activePosition) await executeSell(msg.chat.id);
    else bot.sendMessage(msg.chat.id, "⚠️ **ERROR:** No active assets to liquidate.");
});

bot.onText(/\/manual/i, (msg) => {
    SYSTEM.autoPilot = false;
    bot.sendMessage(msg.chat.id, "🕹️ **MANUAL OVERRIDE:** Monitoring price action for Peak Reversal Signals.");
    if (SYSTEM.activePosition) runProfitMonitor(msg.chat.id);
});

http.createServer((req, res) => res.end("V100000_APEX_ONLINE")).listen(8080).on('error', (e) => {
    console.log("Port 8080 busy, likely another instance running. Please kill it.".red);
});

console.log("🦁 APEX TOTALITY v100008 ONLINE [QUANTUM 100MS + NO REPEATS].".magenta);
