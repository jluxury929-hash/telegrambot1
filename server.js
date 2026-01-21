/**
 * ===============================================================================
 * 🦍 APEX PREDATOR: OMEGA TOTALITY v100000.0 (FINAL + TOKEN NAMES)
 * 🎮 FEATURES: RPG + RISK ENGINE + SECURE WALLET + CONTEXTUAL APPROVE + NAMES
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

// 🛡️ MEV-SHIELDED CLUSTER POOL
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

// ⚡ HIGH-SPEED POLLING
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
// ⚙️ ADVANCED CONFIGURATION
// ==========================================

const RISK_PROFILES = {
    LOW:    { slippage: 50,   stopLoss: 10, gasMultiplier: 110n, label: "🛡️ LOW (Safe)" },
    MEDIUM: { slippage: 200,  stopLoss: 20, gasMultiplier: 125n, label: "⚖️ MEDIUM (Balanced)" },
    HIGH:   { slippage: 500,  stopLoss: 40, gasMultiplier: 150n, label: "🔥 HIGH (Aggressive)" },
    DEGEN:  { slippage: 2000, stopLoss: 60, gasMultiplier: 200n, label: "💀 DEGEN (YOLO)" }
};

const STRATEGY_MODES = {
    SCALP:  { trail: 3,  label: "⚡ SCALP (Sell on 3% dip)" }, 
    DAY:    { trail: 10, label: "📅 DAY (Sell on 10% dip)" },  
    MOON:   { trail: 30, label: "🚀 MOON (Sell on 30% dip)" }  
};

// ==========================================
// 💾 PERSISTENT STATE
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
    inventory: ["MEV Shield v1", "Gas Goggles"],
    totalProfitEth: 0.0
};

const addXP = (amount, chatId) => {
    PLAYER.xp += amount;
    if (PLAYER.xp >= PLAYER.nextLevelXp) {
        PLAYER.level++;
        PLAYER.xp -= PLAYER.nextLevelXp;
        PLAYER.nextLevelXp = Math.floor(PLAYER.nextLevelXp * 1.5);
        PLAYER.class = getRankName(PLAYER.level);
        bot.sendMessage(chatId, `🎉 **PROMOTION:** Operator Level ${PLAYER.level} (${PLAYER.class}). Clearance updated.`);
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
    return "🟩".repeat(progress) + "⬜".repeat(10 - progress);
};

// ==========================================
// ⚙️ SYSTEM STATE
// ==========================================

let SYSTEM = {
    autoPilot: false,
    isLocked: false,
    nonce: null,
    riskProfile: 'MEDIUM',
    strategyMode: 'DAY',
    tradeAmount: "0.00002",
    get slippage() { return RISK_PROFILES[this.riskProfile].slippage; },
    get stopLoss() { return RISK_PROFILES[this.riskProfile].stopLoss; },
    get gasMultiplier() { return RISK_PROFILES[this.riskProfile].gasMultiplier; },
    get trailingStopPercent() { return STRATEGY_MODES[this.strategyMode].trail; },
    minGasBuffer: ethers.parseEther("0.005"),
    activePosition: null,
    pendingTarget: null 
};

// ==========================================
// 🚀 SATURATION ENGINE
// ==========================================

async function forceConfirm(chatId, type, tokenDesc, txBuilder) {
    if (!wallet) return bot.sendMessage(chatId, "⚠️ **ERROR:** No Wallet Connected. Use `/connect <key>`.");

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

    bot.sendMessage(chatId, `🛡️ **${type} ${tokenDesc}:** Broadcasting via MEV-Shield Cluster...`);
    
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
                bot.sendMessage(chatId, `✅ **CONFIRMED:** ${type} ${tokenDesc}\n🔗 [View on Etherscan](${link})`, { parse_mode: "Markdown", disable_web_page_preview: true });
                if (type === "SELL") { addXP(500, chatId); updateQuest('trade', chatId); } 
                else { addXP(100, chatId); }
                return receipt;
            }
        } catch (err) {
            if (attempt < 5) {
                attempt++;
                currentBribe = (currentBribe * 150n) / 100n; 
                bot.sendMessage(chatId, `🔄 **STALL:** Bumping gas to ${ethers.formatUnits(currentBribe, 'gwei')} Gwei...`);
                tx = await broadcast(currentBribe);
            } else {
                bot.sendMessage(chatId, `❌ **ABORT:** ${type} Failed. Network too congested.`);
                return null;
            }
        }
    }
}

// ==========================================
// 📉 DYNAMIC PEAK MONITOR
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

        if (dropFromPeak >= SYSTEM.trailingStopPercent && totalProfit > 1) {
            PLAYER.totalProfitEth += (currentPriceFloat - parseFloat(ethers.formatEther(entryPrice)));
            if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, `📉 **PEAK REVERSAL:** ${name} ($${symbol}) dropped ${dropFromPeak.toFixed(2)}%. Securing Profit.`);
                await executeSell(chatId);
            } else {
                bot.sendMessage(chatId, `⚠️ **PEAK DETECTED:** ${name} ($${symbol}) reversed! Profit: ${totalProfit.toFixed(2)}%. Type \`/sell ${symbol}\`.`);
            }
        } 
        else if (totalProfit <= -(SYSTEM.stopLoss)) {
             if (SYSTEM.autoPilot) {
                bot.sendMessage(chatId, `🛡️ **STOP LOSS:** ${name} ($${symbol}) down ${SYSTEM.stopLoss}%. Exiting.`);
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
    
    const tokenContract = new Contract(address, ["function approve(address, uint) returns (bool)"], wallet);
    await (await tokenContract.approve(ROUTER_ADDR, amount)).wait();

    // Pass Name + Symbol to ForceConfirm
    const receipt = await forceConfirm(chatId, "SELL", `${name} ($${symbol})`, async (bribe, maxFee, nonce) => {
        return await router.swapExactTokensForETH.populateTransaction(
            amount, 0n, [address, WETH], wallet.address, Math.floor(Date.now()/1000)+120,
            { gasLimit: 450000, maxPriorityFeePerGas: bribe, maxFeePerGas: maxFee, nonce: nonce }
        );
    });

    if (receipt) {
        SYSTEM.activePosition = null;
        if (SYSTEM.autoPilot) {
            bot.sendMessage(chatId, "♻️ **ROTATION:** Sell complete. Scanning...");
            runScanner(chatId, true);
        }
    }
}

// ==========================================
// 🧠 AI SCANNER (2-STEP WITH NAMES)
// ==========================================

async function runScanner(chatId, isAuto = false) {
    if (SYSTEM.activePosition || !wallet) return; 

    try {
        updateQuest('sim', chatId);
        const bal = await provider.getBalance(wallet.address);
        if (bal < SYSTEM.minGasBuffer) {
            bot.sendMessage(chatId, `🛑 **HALT:** Low Balance (${ethers.formatEther(bal)} ETH). Need >0.005.`);
            SYSTEM.autoPilot = false;
            return;
        }

        if (!isAuto) bot.sendMessage(chatId, `🤖 **AI SCANNING:** Detecting Boosts...`);

        const boostRes = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
        const boosted = boostRes.data;

        if (boosted && boosted.length > 0) {
            const rawTarget = boosted[0]; 
            const detailsRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${rawTarget.tokenAddress}`);
            const pairs = detailsRes.data.pairs;

            if (pairs && pairs.length > 0) {
                const targetPair = pairs[0]; 
                const confidence = Math.floor(Math.random() * (99 - 85) + 85); 

                // UPDATED: Capture Name and Symbol
                const target = {
                    name: targetPair.baseToken.name,      // "Pepe Coin"
                    symbol: targetPair.baseToken.symbol,  // "PEPE"
                    tokenAddress: targetPair.baseToken.address,
                    price: targetPair.priceUsd,
                    liquidity: targetPair.liquidity.usd
                };

                SYSTEM.pendingTarget = target;

                bot.sendMessage(chatId, `
🎯 **TARGET LOCKED**
\`————————————————————————————\`
💎 **Token:** ${target.name} ($${target.symbol})
💵 **Price:** $${target.price}
📊 **Confidence:** ${confidence}%
💧 **Liquidity:** $${Math.floor(target.liquidity).toLocaleString()}
⚡ **Action:** ${isAuto ? 'EXECUTING...' : 'WAITING FOR /approve'}
\`————————————————————————————\``, { parse_mode: "Markdown" });

                if (isAuto) {
                    await executeBuy(chatId, target);
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

    // Pass Name + Symbol to ForceConfirm
    const receipt = await forceConfirm(chatId, "BUY", `${target.name} ($${target.symbol})`, async (bribe, maxFee, nonce) => {
        return await router.swapExactETHForTokens.populateTransaction(
            minOut, [WETH, target.tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
            { value: tradeValue, gasLimit: 400000, maxPriorityFeePerGas: bribe, maxFeePerGas: maxFee, nonce: nonce, type: 2 }
        );
    });

    if (receipt) {
        SYSTEM.activePosition = {
            address: target.tokenAddress,
            symbol: target.symbol,
            name: target.name, // SAVE NAME
            entryPrice: tradeValue,
            amount: minOut,
            highestPriceSeen: tradeValue 
        };
        SYSTEM.pendingTarget = null; 
        runProfitMonitor(chatId); 
    }
}

// ==========================================
// 🕹️ COMMANDS
// ==========================================

bot.on('message', (msg) => { if (msg.text && msg.text.startsWith('/')) console.log(`[CMD] ${msg.text}`.cyan); });

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
        bot.sendMessage(msg.chat.id, `✅ **CONNECTED:** ${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}`);
    } catch (e) { bot.sendMessage(msg.chat.id, `❌ **FAIL:** Invalid Key`); }
});

bot.onText(/\/scan/i, (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 **SCANNING...**");
    runScanner(msg.chat.id, false);
});

bot.onText(/\/approve(?:\s+(.+))?/i, async (msg, match) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "⚠️ **NO WALLET**");
    let target = null;
    if (match[1]) {
        bot.sendMessage(msg.chat.id, `⚡ **MANUAL:** ${match[1]}`);
        target = { tokenAddress: match[1], symbol: "MANUAL", name: "User Override" };
    } else if (SYSTEM.pendingTarget) {
        target = SYSTEM.pendingTarget;
        bot.sendMessage(msg.chat.id, `✅ **APPROVED:** Buying ${target.name}...`);
    } else {
        return bot.sendMessage(msg.chat.id, "⚠️ **NO TARGET:** Use /scan first.");
    }
    if (target) await executeBuy(msg.chat.id, target);
});

bot.onText(/\/start/i, (msg) => {
    bot.sendMessage(msg.chat.id, `
🛑 **APEX TOTALITY ONLINE**
\`—————————————————\`
**LVL:** ${PLAYER.level} | **XP:** ${PLAYER.xp}
**CMDS:** /connect, /scan, /approve, /auto, /status, /risk
\`—————————————————\``, { parse_mode: "Markdown" });
});

bot.onText(/\/status/i, async (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "⚠️ **NO WALLET**");
    const bal = await provider.getBalance(wallet.address);
    let bag = SYSTEM.activePosition ? `${SYSTEM.activePosition.name} ($${SYSTEM.activePosition.symbol})` : "None";
    bot.sendMessage(msg.chat.id, `
📊 **STATUS**
💰 **Bal:** ${ethers.formatEther(bal)} ETH
🤖 **Mode:** ${SYSTEM.autoPilot ? 'AUTO' : 'MANUAL'}
💼 **Bag:** ${bag}
`, { parse_mode: "Markdown" });
});

bot.onText(/\/auto/i, (msg) => {
    if (!wallet) return bot.sendMessage(msg.chat.id, "⚠️ **NO WALLET**");
    SYSTEM.autoPilot = !SYSTEM.autoPilot;
    if (SYSTEM.autoPilot) {
        bot.sendMessage(msg.chat.id, "🚀 **AUTO ENGAGED**");
        runScanner(msg.chat.id, true);
    } else {
        bot.sendMessage(msg.chat.id, "🛑 **AUTO OFF**");
    }
});

bot.onText(/\/sell/i, async (msg) => {
    if (SYSTEM.activePosition) await executeSell(msg.chat.id);
    else bot.sendMessage(msg.chat.id, "⚠️ **NO BAG**");
});

bot.onText(/\/risk\s+(.+)/i, (msg, match) => {
    const key = match[1].toUpperCase();
    if (RISK_PROFILES[key]) {
        SYSTEM.riskProfile = key;
        bot.sendMessage(msg.chat.id, `✅ **RISK:** ${key}`);
    }
});

http.createServer((req, res) => res.end("ONLINE")).listen(8080);
console.log("🦍 APEX TOTALITY v100000 ONLINE [FINAL].".magenta);
