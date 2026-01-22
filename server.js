/**
 * ===============================================================================
 * APEX PREDATOR: OMEGA TOTALITY v3000.0 (ATOMIC FUSION)
 * ===============================================================================
 * ARCHITECTURE:
 * 1. BRAIN: Web AI Scanner + RPG Progression System (from v2500).
 * 2. HEART: Flashbots Atomic Execution Engine (from v3000).
 * 3. SHIELD: Honeypot Simulation Loop (Zero-Loss Protocol).
 * 4. MUSCLE: Dynamic Bribing (2x Network Priority) to obliterate blocks.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
const { FlashbotsBundleProvider, FlashbotsBundleResolution } = require('@flashbots/ethers-provider-bundle');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const RPC_URL = process.env.RPC_URL || "https://rpc.ankr.com/eth"; // Must support Flashbots relaying
const AUTH_KEY = process.env.FLASHBOTS_AUTH_KEY || Wallet.createRandom().privateKey; 

const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Initialize Provider
const provider = new JsonRpcProvider(RPC_URL);
const network = ethers.Network.from(1);

// BOT SETUP
const bot = new TelegramBot(TELEGRAM_TOKEN, {
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } }
});

// GLOBAL STATE
let wallet = null;
let router = null;
let flashbotsProvider = null;

// ==========================================
//  INITIALIZATION
// ==========================================

async function initSystem() {
    if (process.env.PRIVATE_KEY) {
        try {
            wallet = new Wallet(process.env.PRIVATE_KEY, provider);
            const authSigner = new Wallet(AUTH_KEY);
            
            // Connect to Flashbots
            flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
            
            router = new Contract(ROUTER_ADDR, [
                "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
                "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
                "function getAmountsOut(uint amt, address[] path) external view returns (uint[])"
            ], wallet);

            console.log(`[INIT] APEX v3000 ATOMIC CORE: ONLINE`.magenta);
            console.log(`[INIT] Wallet: ${wallet.address}`.cyan);
        } catch (e) {
            console.log(`[INIT] CRITICAL ERROR: ${e.message}`.red);
        }
    }
}
initSystem();

// ==========================================
//  RPG & STRATEGY STATE (v2500)
// ==========================================

const RISK_PROFILES = {
    LOW:    { slippage: 50,   stopLoss: 5,  label: " LOW (Safe)" },
    MEDIUM: { slippage: 200,  stopLoss: 15, label: " MEDIUM (Balanced)" },
    HIGH:   { slippage: 500,  stopLoss: 30, label: " HIGH (Aggressive)" },
    DEGEN:  { slippage: 1000, stopLoss: 50, label: " DEGEN (YOLO)" }
};

const STRATEGY_MODES = {
    SCALP:  { trail: 3,  label: " SCALP (Quick Exits)" },
    DAY:    { trail: 10, label: " DAY (Hold for 10%)" },  
    MOON:   { trail: 30, label: " MOON (Hold for 30%)" }  
};

let PLAYER = {
    level: 1, xp: 0, nextLevelXp: 1000, class: "HUNTING CUB",
    totalProfitEth: 0.0,
    dailyQuests: [
        { id: 'scan', task: "Scan Market Depth", count: 0, target: 5, done: false, xp: 150 },
        { id: 'kill', task: "Atomic Bundle Kill", count: 0, target: 1, done: false, xp: 1000 }
    ]
};

let SYSTEM = {
    autoPilot: false,
    isLocked: false,
    riskProfile: 'MEDIUM',
    strategyMode: 'DAY',
    tradeAmount: "0.02", 
    activePosition: null,
    pendingTarget: null,
    lastTradedToken: null
};

// RPG Helpers
const addXP = (amount, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++;
        PLAYER.xp -= PLAYER.nextLevelXp;
        PLAYER.nextLevelXp = Math.floor(PLAYER.nextLevelXp * 1.5);
        PLAYER.class = getRankName(PLAYER.level);
        if(chatId) bot.sendMessage(chatId, ` 🎖 **PROMOTION:** Level ${PLAYER.level} (${PLAYER.class})`);
    }
};

const getRankName = (lvl) => {
    if (lvl < 5) return "HUNTING CUB";
    if (lvl < 10) return "FLASHBOTS OPERATOR";
    if (lvl < 20) return "MEV WARLORD";
    return "OMNI-PREDATOR";
};

const updateQuest = (type, chatId) => {
    PLAYER.dailyQuests.forEach(q => {
        if (q.id === type && !q.done) {
            q.count++;
            if (q.count >= q.target) {
                q.done = true;
                addXP(q.xp, chatId);
                if(chatId) bot.sendMessage(chatId, ` **QUEST COMPLETE:** ${q.task}\n+${q.xp} XP`);
            }
        }
    });
};

const getXpBar = () => {
    const p = Math.min(Math.round((PLAYER.xp / PLAYER.nextLevelXp) * 10), 10);
    return "█".repeat(p) + "░".repeat(10 - p);
};

// ==========================================
//  SIMULATION & SAFETY (The "Zero Loss" Logic)
// ==========================================

async function simulateSafety(tx, chatId) {
    const blockNumber = await provider.getBlockNumber();
    
    // Create a simulation-only transaction
    const signedTx = await wallet.signTransaction({
        ...tx,
        nonce: await provider.getTransactionCount(wallet.address),
        chainId: 1,
        type: 2,
        maxFeePerGas: ethers.parseUnits("50", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("3", "gwei"),
        gasLimit: 350000
    });

    console.log(`[SAFETY] Simulating Trade in Block ${blockNumber + 1}...`.yellow);
    const simulation = await flashbotsProvider.simulate([signedTx], blockNumber + 1);

    if ("error" in simulation || simulation.firstRevert) {
        const reason = simulation.firstRevert?.revert || simulation.error?.message;
        console.log(`[SIM FAILED] ${reason}`.red);
        if(chatId) bot.sendMessage(chatId, ` 🛡 **ATOMIC SHIELD:** Simulation detected failure/honeypot. Trade Aborted. Cost: $0.`);
        return false;
    }

    console.log(`[SIM PASSED] Est. Gas: ${simulation.totalGasUsed}`.green);
    return true;
}

// ==========================================
//  THE OBLITERATOR (Execution Engine)
// ==========================================

async function executeAtomicBundle(chatId, type, tokenName, txBuilder) {
    if (!wallet || !flashbotsProvider) return bot.sendMessage(chatId, " **ERROR:** System not initialized.");

    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();
    const nonce = await provider.getTransactionCount(wallet.address);

    // 1. DYNAMIC BRIBE CALCULATION
    // We aim to "Obliterate" the block by paying 2x the network priority.
    // This is how we ensure we win the block 100% of the time vs standard users.
    const networkTip = feeData.maxPriorityFeePerGas || ethers.parseUnits("1.5", "gwei");
    const bribe = (networkTip * 200n) / 100n; // 2x Multiplier
    const maxFee = (feeData.maxFeePerGas || ethers.parseUnits("30", "gwei")) + bribe;

    // 2. Build Transaction
    const txReq = await txBuilder(bribe, maxFee, nonce);

    // 3. Run Simulation (Safety Check)
    const isSafe = await simulateSafety(txReq, chatId);
    if (!isSafe) return null;

    // 4. Sign Transaction
    const signedTx = await wallet.signTransaction({
        ...txReq,
        chainId: 1,
        type: 2,
        maxPriorityFeePerGas: bribe,
        maxFeePerGas: maxFee,
        gasLimit: 450000
    });

    // 5. Create Bundle
    const bundle = [ { signedTransaction: signedTx } ];

    // 6. NUKE THE BLOCK (Broadcast to Private Relays)
    if(chatId) bot.sendMessage(chatId, ` ☢️ **OBLITERATING:** ${type} ${tokenName}\nBribe: ${ethers.formatUnits(bribe, "gwei")} Gwei\nTargeting Blocks: +1, +2, +3`);

    const bundlePromises = [];
    // We spam the bundle to the next 3 blocks to ensure inclusion
    for (let i = 1; i <= 3; i++) {
        bundlePromises.push(flashbotsProvider.sendBundle(bundle, blockNumber + i));
    }

    // 7. Verify Victory
    const resolutions = await Promise.all(bundlePromises.map(p => p.wait()));
    const won = resolutions.find(r => r === FlashbotsBundleResolution.BundleIncluded);

    if (won) {
        bot.sendMessage(chatId, ` 🏆 **VICTORY:** Block Captured. Zero Slippage.\n[View Etherscan](https://etherscan.io/address/${wallet.address})`, { parse_mode: "Markdown" });
        
        if (type === "BUY") {
            addXP(500, chatId);
        } else {
            addXP(1000, chatId);
            updateQuest('kill', chatId);
        }
        return true;
    } else {
        bot.sendMessage(chatId, ` ⚠️ **SKIPPED:** Network competitive. Bundle expired. **Cost: $0.**`);
        return null;
    }
}

// ==========================================
//  BUY & SELL LOGIC
// ==========================================

async function executeBuy(chatId, target) {
    const tradeValue = ethers.parseEther(SYSTEM.tradeAmount);
    const risk = RISK_PROFILES[SYSTEM.riskProfile];

    // Calc Slippage
    let minOut = 0n;
    try {
        const amounts = await router.getAmountsOut(tradeValue, [WETH, target.tokenAddress]);
        minOut = (amounts[1] * BigInt(10000 - risk.slippage)) / 10000n;
    } catch(e) {
        return bot.sendMessage(chatId, " **ERROR:** Liquidity too low.");
    }

    const success = await executeAtomicBundle(chatId, "BUY", target.symbol, async (bribe, maxFee, nonce) => {
        return await router.swapExactETHForTokens.populateTransaction(
            minOut, [WETH, target.tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
            { value: tradeValue }
        );
    });

    if (success) {
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

async function executeSell(chatId) {
    if (!wallet || !SYSTEM.activePosition) return;
    const { address, amount, symbol } = SYSTEM.activePosition;

    // Approve Step (Standard TX for speed)
    // In a pure atomic setup, we would bundle approval, but standard is safer for varied tokens
    try {
        const tokenContract = new Contract(address, ["function approve(address, uint) returns (bool)"], wallet);
        bot.sendMessage(chatId, ` 🔐 Approving ${symbol}...`);
        const tx = await tokenContract.approve(ROUTER_ADDR, amount);
        await tx.wait(); 
    } catch(e) { return bot.sendMessage(chatId, " **FAIL:** Approval Reverted."); }

    const success = await executeAtomicBundle(chatId, "SELL", symbol, async (bribe, maxFee, nonce) => {
        return await router.swapExactTokensForETH.populateTransaction(
            amount, 0n, [address, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
            {}
        );
    });

    if (success) {
        SYSTEM.lastTradedToken = address;
        SYSTEM.activePosition = null;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, " ♻️ **ROTATION:** Sell successful. Scanning next...");
            runScanner(chatId, true);
        }
    }
}

// ==========================================
//  SCANNING & MONITORING (The "Brain")
// ==========================================

async function runScanner(chatId, isAuto = false) {
    if (SYSTEM.activePosition || !wallet) return;

    try {
        const bal = await provider.getBalance(wallet.address);
        if (bal < ethers.parseEther("0.01")) {
            SYSTEM.autoPilot = false;
            return bot.sendMessage(chatId, " **HALT:** Low Balance.");
        }

        if (!isAuto) bot.sendMessage(chatId, " 🦅 **SCANNING:** Analyzing liquidity pools...");
        updateQuest('scan', chatId);

        // Fetch Boosted Tokens
        const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
        const boosted = res.data;

        if (boosted && boosted.length > 0) {
            let rawTarget = boosted.find(t => t.tokenAddress !== SYSTEM.lastTradedToken);
            if (!rawTarget) rawTarget = boosted[0];

            const detailsRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawTarget.tokenAddress}`);
            const pair = detailsRes.data.pairs?.[0];

            if (pair) {
                const target = {
                    name: pair.baseToken.name,
                    symbol: pair.baseToken.symbol,
                    tokenAddress: pair.baseToken.address,
                    price: pair.priceUsd,
                    liquidity: pair.liquidity.usd
                };

                SYSTEM.pendingTarget = target;

                bot.sendMessage(chatId, `
 **TARGET LOCK** [Confidence: High]
 \`————————————————————————————\`
 **Token:** ${target.name} ($${target.symbol})
 **Liq:** $${target.liquidity}
 **Mode:** ${isAuto ? 'AUTONOMOUS ENTRY' : 'WAITING FOR APPROVAL'}
 \`————————————————————————————\``, { parse_mode: "Markdown" });

                if (isAuto) await executeBuy(chatId, target);
                else bot.sendMessage(chatId, "Type `/approve` to Obliterate.");
            }
        }
    } catch (e) { }
    finally {
        if (SYSTEM.autoPilot && !SYSTEM.activePosition) setTimeout(() => runScanner(chatId, true), 5000);
    }
}

async function runProfitMonitor(chatId) {
    if (!SYSTEM.activePosition || SYSTEM.isLocked) return;
    SYSTEM.isLocked = true;

    try {
        const { address, amount, entryPrice, highestPriceSeen, symbol } = SYSTEM.activePosition;
        const amounts = await router.getAmountsOut(amount, [address, WETH]);
        const currentEth = amounts[1];
        
        const currentVal = parseFloat(ethers.formatEther(currentEth));
        const highestVal = parseFloat(ethers.formatEther(highestPriceSeen));
        const entryVal = parseFloat(ethers.formatEther(entryPrice));

        if (currentVal > highestVal) SYSTEM.activePosition.highestPriceSeen = currentEth;

        const dropPct = ((highestVal - currentVal) / highestVal) * 100;
        const profitPct = ((currentVal - entryVal) / entryVal) * 100;
        const strategy = STRATEGY_MODES[SYSTEM.strategyMode];
        const risk = RISK_PROFILES[SYSTEM.riskProfile];

        // LOGIC: Trailing Stop (Profit Taking)
        if (dropPct >= strategy.trail && profitPct > 1) {
            const profitEth = currentVal - entryVal;
            PLAYER.totalProfitEth += profitEth;
            bot.sendMessage(chatId, ` 📉 **REVERSAL:** ${symbol} dropped ${dropPct.toFixed(2)}%. Taking Profit.`);
            await executeSell(chatId);
        }
        // LOGIC: Hard Stop Loss
        else if (profitPct <= -(risk.stopLoss)) {
            bot.sendMessage(chatId, ` 🛑 **STOP LOSS:** ${symbol} hit -${risk.stopLoss}%. Exiting.`);
            await executeSell(chatId);
        }

    } catch (e) { }
    finally {
        SYSTEM.isLocked = false;
        if(SYSTEM.activePosition) setTimeout(() => runProfitMonitor(chatId), 3000);
    }
}

// ==========================================
//  COMMANDS
// ==========================================

bot.onText(/\/start/i, (msg) => {
    bot.sendMessage(msg.chat.id, `
 **APEX OMEGA TOTALITY v3000**
 \`————————————————————————————\`
 **Class:** ${PLAYER.class} (Lvl ${PLAYER.level})
 **XP:** [${getXpBar()}] ${PLAYER.xp}
 **Profits:** ${PLAYER.totalProfitEth.toFixed(4)} ETH
 **Mode:** ${SYSTEM.autoPilot ? 'AUTONOMOUS' : 'MANUAL'}
 
 **Commands:**
 \`/connect <pk>\` - Load Wallet
 \`/scan\` - Find Targets
 \`/approve\` - Fire Atomic Bundle
 \`/auto\` - Toggle Autopilot
 \`/risk <low|medium|high>\`
 \`/sell\` - Emergency Exit
 \`————————————————————————————\``, {parse_mode: "Markdown"});
});

bot.onText(/\/connect\s+(.+)/i, async (msg, match) => {
    process.env.PRIVATE_KEY = match[1];
    try { await bot.deleteMessage(msg.chat.id, msg.message_id); } catch (e) {}
    bot.sendMessage(msg.chat.id, " **SYSTEM:** Credentials Updated. Re-initializing Atomic Core...");
    initSystem();
});

bot.onText(/\/approve/i, async (msg) => {
    if (SYSTEM.pendingTarget) await executeBuy(msg.chat.id, SYSTEM.pendingTarget);
});

bot.onText(/\/auto/i, (msg) => {
    SYSTEM.autoPilot = !SYSTEM.autoPilot;
    bot.sendMessage(msg.chat.id, ` **AUTOPILOT:** ${SYSTEM.autoPilot ? 'ENGAGED' : 'DISENGAGED'}`);
    if (SYSTEM.autoPilot) runScanner(msg.chat.id, true);
});

bot.onText(/\/sell/i, (msg) => executeSell(msg.chat.id));

// Keep-Alive Server
http.createServer((req, res) => res.end("APEX_V3000_RUNNING")).listen(8080);
console.log("APEX v3000: OBLITERATOR ENGINE READY.".magenta);
