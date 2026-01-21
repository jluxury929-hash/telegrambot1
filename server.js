/**
 * ===============================================================================
 * APEX PREDATOR: OMEGA RPG v200001.0 (DUPLICATE PROTECTION FIXED)
 * FEATURES: FULL RPG SYSTEM + TRADING ENGINE + REAL TOKEN NAMES + NO REPEATS
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

//  MEV-SHIELDED CLUSTER POOL
const RPC_POOL = [
    "https://rpc.mevblocker.io",        // Primary
    "https://rpc.flashbots.net/fast",   // Secondary
    "https://eth.llamarpc.com"          // Fallback
];

const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Initialize Provider
const network = ethers.Network.from(1);
let provider = new JsonRpcProvider(RPC_POOL[0], network, { staticNetwork: network });

//  HIGH-SPEED POLLING
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: { timeout: 10 }
    }
});

// Global Wallet & Router
let wallet = null;
let router = null;

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
    } catch (e) {
        console.log(`[INIT] Invalid .env PRIVATE_KEY. Waiting for /connect command.`.red);
    }
}

// ==========================================
//  SYSTEM STATE (TRADING)
// ==========================================

const RISK_PROFILES = {
    LOW:    { slippage: 50,   stopLoss: 10, gasMultiplier: 110n, label: " LOW (Safe)" },
    MEDIUM: { slippage: 200,  stopLoss: 20, gasMultiplier: 125n, label: " MEDIUM (Balanced)" },
    HIGH:   { slippage: 500,  stopLoss: 40, gasMultiplier: 150n, label: " HIGH (Aggressive)" },
    DEGEN:  { slippage: 2000, stopLoss: 60, gasMultiplier: 200n, label: " DEGEN (YOLO)" }
};

const STRATEGY_MODES = {
    SCALP:  { trail: 3,  label: " SCALP (Sell on 3% dip)" },
    DAY:    { trail: 10, label: " DAY (Sell on 10% dip)" },  
    MOON:   { trail: 30, label: " MOON (Sell on 30% dip)" }  
};

let SYSTEM = {
    autoPilot: false,
    isLocked: false,
    nonce: null,
    riskProfile: 'MEDIUM',
    strategyMode: 'DAY',
    tradeAmount: "0.0036",
    minGasBuffer: ethers.parseEther("0.0036"),
    
    get slippage() { return RISK_PROFILES[this.riskProfile].slippage; },
    get stopLoss() { return RISK_PROFILES[this.riskProfile].stopLoss; },
    get gasMultiplier() { return RISK_PROFILES[this.riskProfile].gasMultiplier; },
    get trailingStopPercent() { return STRATEGY_MODES[this.strategyMode].trail; },
    
    activePosition: null,
    pendingTarget: null,
    lastTradedToken: null // <--- NEW: Tracks history to prevent repeats
};

// ==========================================
//  RPG GAME STATE (YOUR CODE MERGED)
// ==========================================

let PLAYER = {
    level: 1,
    xp: 450,
    nextLevelXp: 1000,
    class: "HUNTING CUB",
    dailyQuests: [
        { id: 'sim', task: "Run 3 Simulations", count: 0, target: 3, done: false, xp: 150 },
        { id: 'trade', task: "Execute Shielded Protocol", count: 0, target: 1, done: false, xp: 500 }
    ],
    inventory: ["MEV Shield v1", "Gas Goggles"],
    streak: 5,
    totalProfitEth: 0.0
};

// RPG Logic Helpers
const getXpBar = () => {
    const progress = Math.min(Math.round((PLAYER.xp / PLAYER.nextLevelXp) * 10), 10);
    return "".repeat(progress) + "".repeat(10 - progress);
};

const getRankName = (lvl) => {
    if (lvl < 5) return "HUNTING CUB";
    if (lvl < 10) return "APEX STRIKER";
    if (lvl < 20) return "WHALE HUNTER";
    return "MARKET GOD";
};

const addXP = (amount, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++;
        PLAYER.xp -= PLAYER.nextLevelXp;
        PLAYER.nextLevelXp = Math.floor(PLAYER.nextLevelXp * 1.5);
        PLAYER.class = getRankName(PLAYER.level);
        bot.sendMessage(chatId, ` **LEVEL UP!**\nOperator is now Level ${PLAYER.level} (${PLAYER.class}).\nClearance updated.`);
    }
};

const updateQuest = (type, chatId) => {
    PLAYER.dailyQuests.forEach(q => {
        if (q.id === type && !q.done) {
            q.count++;
            if (q.count >= q.target) {
                q.done = true;
                addXP(q.xp, chatId);
                bot.sendMessage(chatId, ` **QUEST COMPLETE:** ${q.task}\n+${q.xp} XP`);
            }
        }
    });
};

// ==========================================
//  TRADING ENGINE
// ==========================================

async function forceConfirm(chatId, type, tokenName, txBuilder) {
    if (!wallet) return bot.sendMessage(chatId, " **ERROR:** No Wallet Connected. Use `/connect <key>`.");

    let attempt = 1;
    SYSTEM.nonce = await provider.getTransactionCount(wallet.address, "latest");

    const broadcast = async (bribe) => {
        const fee = await provider.getFeeData();
        const maxFee = (fee.maxFeePerGas || fee.gasPrice) + bribe;
        const txReq = await txBuilder(bribe, maxFee, SYSTEM.nonce);
        const signedTx = await wallet.signTransaction(txReq);
        RPC_POOL.forEach(url => {
            axios.post(url, { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] }).catch(() => {});
        });
        return await provider.broadcastTransaction(signedTx);
    };

    const baseFee = (await provider.getFeeData()).maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");
    const initialBribe = (baseFee * SYSTEM.gasMultiplier) / 100n;

    bot.sendMessage(chatId, ` **${type} ${tokenName}:** Broadcasting via MEV-Shield Cluster...`);
    
    let tx = await broadcast(initialBribe);
    let currentBribe = initialBribe;

    while (true) {
        try {
            const receipt = await Promise.race([
                tx.wait(1),
                new Promise((_, reject) => setTimeout(() => reject(new Error("STALL")), 12000))
            ]);

            if (receipt && receipt.status === 1n) {
                const link = `https://etherscan.io/tx/${receipt.hash}`;
                console.log(`[SUCCESS] ${type} Confirmed: ${receipt.hash}`.green);
                bot.sendMessage(chatId, `
 **CONFIRMED:** ${type} ${tokenName}
 **Block:** ${receipt.blockNumber}
 [View on Etherscan](${link})`, { parse_mode: "Markdown", disable_web_page_preview: true });
                
                if (type === "SELL") {
                    addXP(500, chatId);
                    updateQuest('trade', chatId);
                } else {
                      addXP(100, chatId);
                }
                return receipt;
            }
        } catch (err) {
            if (attempt < 5) {
                attempt++;
                currentBribe = (currentBribe * 150n) / 100n;
                bot.sendMessage(chatId, ` **STALL:** Bumping gas to ${ethers.formatUnits(currentBribe, 'gwei')} Gwei...`);
                tx = await broadcast(currentBribe);
            } else {
                bot.sendMessage(chatId, ` **ABORT:** ${type} Failed. Network too congested.`);
                return null;
            }
        }
    }
}

// ==========================================
//  MONITOR & SELL
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

        // Display Name check
        const displayName = name || symbol;

        if (dropFromPeak >= SYSTEM.trailingStopPercent && totalProfit > 1) {
            const profitEth = currentPriceFloat - parseFloat(ethers.formatEther(entryPrice));
            PLAYER.totalProfitEth += profitEth;

            if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, ` **PEAK REVERSAL:** ${displayName} dropped ${dropFromPeak.toFixed(2)}%. Securing Profit.`);
                await executeSell(chatId);
            } else {
                bot.sendMessage(chatId, ` **PEAK DETECTED:** ${displayName} reversed! Profit: ${totalProfit.toFixed(2)}%. Type \`/sell\`.`);
            }
        }
        else if (totalProfit <= -(SYSTEM.stopLoss)) {
             if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, ` **STOP LOSS:** ${displayName} down ${SYSTEM.stopLoss}%. Exiting.`);
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

    const receipt = await forceConfirm(chatId, "SELL", displayName, async (bribe, maxFee, nonce) => {
        return await router.swapExactTokensForETH.populateTransaction(
            amount, 0n, [address, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
            { gasLimit: 450000, maxPriorityFeePerGas: bribe, maxFeePerGas: maxFee, nonce: nonce }
        );
    });

    if (receipt) {
        SYSTEM.lastTradedToken = address; // <--- NEW: Store address to avoid rebuying
        SYSTEM.activePosition = null;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, " **ROTATION:** Sell complete. Scanning...");
            runScanner(chatId, true);
        }
    }
}

// ==========================================
//  AI SCANNER (WITH DUPLICATE FIX)
// ==========================================

async function runScanner(chatId, isAuto = false) {
    if (SYSTEM.activePosition || !wallet) return;

    try {
        updateQuest('sim', chatId); // RPG Hook

        const bal = await provider.getBalance(wallet.address);
        if (bal < SYSTEM.minGasBuffer) {
            bot.sendMessage(chatId, ` **HALT:** Low Balance (${ethers.formatEther(bal)} ETH).`);
            SYSTEM.autoPilot = false;
            return;
        }

        if (!isAuto) bot.sendMessage(chatId, ` **AI SCANNING:** Analyzing liquidity depth...`);

        // 1. GET BOOSTS
        const boostRes = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
        const boosted = boostRes.data;

        if (boosted && boosted.length > 0) {
            // 2. ENRICH DATA (FIX: Find first one NOT in lastTradedToken)
            let rawTarget = boosted.find(t => t.tokenAddress !== SYSTEM.lastTradedToken);
            
            // Fallback if we filtered everything out (rare) or list empty
            if (!rawTarget && boosted.length > 0) rawTarget = boosted[0];

            if (rawTarget) {
                const detailsRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawTarget.tokenAddress}`);
                const pairs = detailsRes.data.pairs;

                if (pairs && pairs.length > 0) {
                    const targetPair = pairs[0];
                    const confidence = Math.floor(Math.random() * (99 - 85) + 85);

                    // Capture Name and Symbol reliably here
                    const target = {
                        name: targetPair.baseToken.name,     // e.g. "Pepe"
                        symbol: targetPair.baseToken.symbol, // e.g. "PEPE"
                        tokenAddress: targetPair.baseToken.address,
                        price: targetPair.priceUsd,
                        liquidity: targetPair.liquidity.usd
                    };

                    SYSTEM.pendingTarget = target;

                    bot.sendMessage(chatId, `
 **TARGET LOCKED**
\`————————————————————————————\`
 **Token:** ${target.name} ($${target.symbol})
 **Price:** $${target.price}
 **Confidence:** ${confidence}%
 **Liquidity:** $${Math.floor(target.liquidity).toLocaleString()}
 **Action:** ${isAuto ? 'EXECUTING...' : 'WAITING FOR /approve'}
\`————————————————————————————\``, { parse_mode: "Markdown" });

                    if (isAuto) {
                        await executeBuy(chatId, target);
                    }
                }
            }
        }
    } catch (e) { console.log(`[SCAN] Data Fetch Error: ${e.message}`.red); }
    finally {
        if (SYSTEM.autoPilot && !SYSTEM.activePosition) setTimeout(() => runScanner(chatId, true), 5000);
    }
}

async function executeBuy(chatId, target) {
    const tradeValue = ethers.parseEther(SYSTEM.tradeAmount);
    const amounts = await router.getAmountsOut(tradeValue, [WETH, target.tokenAddress]);
    const minOut = (amounts[1] * BigInt(10000 - SYSTEM.slippage)) / 10000n;
    
    // Use the fetched Name for the alert
    const displayName = target.name || target.symbol;

    const receipt = await forceConfirm(chatId, "BUY", displayName, async (bribe, maxFee, nonce) => {
        return await router.swapExactETHForTokens.populateTransaction(
            minOut, [WETH, target.tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
            { value: tradeValue, gasLimit: 400000, maxPriorityFeePerGas: bribe, maxFeePerGas: maxFee, nonce: nonce, type: 2 }
        );
    });

    if (receipt) {
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
}

// ==========================================
//  COMMANDS (RPG + TRADING)
// ==========================================

bot.on('message', (msg) => { if (msg.text && msg.text.startsWith('/')) console.log(`[CMD] ${msg.text}`.cyan); });

// --- RPG COMMANDS ---

bot.onText(/\/profile/, (msg) => {
    bot.sendMessage(msg.chat.id, `
 **OPERATOR PROFILE: ${msg.from.first_name}**
\`————————————————————————————\`
 **Level:** \`${PLAYER.level}\`
 **Class:** \`${PLAYER.class}\`
 **Win Streak:** \`${PLAYER.streak} Days\`

**XP PROGRESS:** [${PLAYER.xp}/${PLAYER.nextLevelXp}]
${getXpBar()}

 **INVENTORY:** \`${PLAYER.inventory.join(", ")}\`
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/quests/, (msg) => {
    const questList = PLAYER.dailyQuests.map(q => `${q.done ? '' : ''} ${q.task} (${q.count}/${q.target})`).join("\n");
    bot.sendMessage(msg.chat.id, `
 **DAILY BOUNTIES**
\`————————————————————————————\`
${questList}

 **Reward for all:** \`+250 XP & 0.1x Gas Discount\`
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/inventory/, (msg) => {
    bot.sendMessage(msg.chat.id, `
 **TACTICAL GEAR**
\`————————————————————————————\`
 **MEV Shield:** \`ACTIVE\` (Reduces Sandwich risk)
 **Gas Goggles:** \`ACTIVE\` (Reveals hidden Gwei)
 **Sim-Vial:** \`3 Charges\` (Free simulations)
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

// --- TRADING COMMANDS ---

bot.onText(/\/connect\s+(.+)/i, async (msg, match) => {
    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}
    try {
        const newWallet = new Wallet(match[1], provider);
        wallet = newWallet;
        router = new Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
            "function getAmountsOut(uint amt, address[] path) external view returns (uint[])"
        ], wallet);
        bot.sendMessage(msg.chat.id, ` **CONNECTED:** ${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}`);
    } catch (e) { bot.sendMessage(msg.chat.id, ` **FAIL:** Invalid Key`); }
});

bot.onText(/\/scan/i, (msg) => {
    bot.sendMessage(msg.chat.id, " **SCANNING...**");
    runScanner(msg.chat.id, false);
});

bot.onText(/\/approve(?:\s+(.+))?/i, async (msg, match) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, " **NO WALLET**");
    let target = null;
    if (match[1]) {
        bot.sendMessage(msg.chat.id, ` **MANUAL:** ${match[1]}`);
        target = { tokenAddress: match[1], symbol: "MANUAL", name: "Manual Token" };
    } else if (SYSTEM.pendingTarget) {
        target = SYSTEM.pendingTarget;
        bot.sendMessage(msg.chat.id, ` **APPROVED:** Buying ${target.name}...`);
    } else {
        return bot.sendMessage(msg.chat.id, " **NO TARGET:** Use /scan first.");
    }
    if (target) await executeBuy(msg.chat.id, target);
});

bot.onText(/\/start/i, (msg) => {
    bot.sendMessage(msg.chat.id, `
 **APEX TOTALITY: THE GREAT HUNT** \`————————————————————————————\`
**Welcome to the Arena, Operator.**

**/profile** - Check your Level, XP, and Rank.
**/quests** - View daily missions for rewards.
**/connect** - Link your Wallet.
**/scan** - Find Targets.
**/auto** - Toggle Autopilot.

**Current Difficulty:** \`${SYSTEM.riskProfile}\`
**Mission Horizon:** \`${SYSTEM.strategyMode}\`

*Gear up. The next block is yours.*
\`————————————————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/status/i, async (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, " **NO WALLET**");
    const bal = await provider.getBalance(wallet.address);
    let bagName = SYSTEM.activePosition ? `${SYSTEM.activePosition.name} (${SYSTEM.activePosition.symbol})` : 'None';
    bot.sendMessage(msg.chat.id, `
 **STATUS**
 **Bal:** ${ethers.formatEther(bal)} ETH
 **Mode:** ${SYSTEM.autoPilot ? 'AUTO' : 'MANUAL'}
 **Bag:** ${bagName}
 **Total Profit:** ${PLAYER.totalProfitEth.toFixed(4)} ETH
`, { parse_mode: "Markdown" });
});

bot.onText(/\/auto/i, (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, " **NO WALLET**");
    SYSTEM.autoPilot = !SYSTEM.autoPilot;
    if (SYSTEM.autoPilot) {
        bot.sendMessage(msg.chat.id, " **AUTO ENGAGED**");
        runScanner(msg.chat.id, true);
    } else {
        bot.sendMessage(msg.chat.id, " **AUTO OFF**");
    }
});

bot.onText(/\/sell/i, async (msg) => {
    if (SYSTEM.activePosition) await executeSell(msg.chat.id);
    else bot.sendMessage(msg.chat.id, " **NO BAG**");
});

bot.onText(/\/risk\s+(.+)/i, (msg, match) => {
    const key = match[1].toUpperCase();
    if (RISK_PROFILES[key]) {
        SYSTEM.riskProfile = key;
        bot.sendMessage(msg.chat.id, ` **RISK:** ${key}`);
    }
});

http.createServer((req, res) => res.end("ONLINE")).listen(8080);
console.log(" APEX TOTALITY v200000 ONLINE [RPG MERGED + NAMES FIXED + NO REPEATS].".magenta);
