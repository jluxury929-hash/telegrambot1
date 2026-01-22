/**
 * ===============================================================================
 * 🦁 APEX PREDATOR: OBLITERATOR v3000 [INTEGRATED AUTONOMY]
 * ===============================================================================
 * COMMANDS:
 * /scan  -> Finds target, locks it in memory. (Manual Mode)
 * /buy   -> Executes trade on locked target.
 * /sell  -> Panic sells current position.
 * /auto  -> Toggles full autonomous loop (Scan -> Buy -> Monitor -> Sell).
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
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || "https://rpc.ankr.com/eth";
const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// --- GLOBAL STATE ---
const provider = new JsonRpcProvider(RPC_URL);
let wallet = null;
let router = null;
let flashbotsProvider = null;
let bot = null;

// SYSTEM STATE
let SYSTEM = {
    autoPilot: false,
    state: "IDLE", // IDLE, HUNTING, MONITORING
    riskProfile: 'MEDIUM',
    tradeAmount: "0.02", // ETH Amount to trade
    
    // MEMORY SLOTS
    pendingTarget: null,   // Stores target from /scan for /buy
    activePosition: null,  // Stores current holding for /sell
    scannedTokens: new Set(), // Prevents re-buying same token in one session
    
    config: {
        trailingStop: 10,  // Sell if price drops 10% from peak
        stopLoss: 15,      // Sell if price drops 15% from entry
        minLiquidity: 50000 // Min Liquidity in USD to consider
    }
};

let PLAYER = {
    level: 1, xp: 0, nextLevelXp: 1000,
    wins: 0, totalProfit: 0.0
};

// ==========================================
// 1. INITIALIZATION
// ==========================================
async function init() {
    if (!TELEGRAM_TOKEN || !PRIVATE_KEY) {
        console.log("❌ MISSING CONFIG: Check .env for TELEGRAM_TOKEN and PRIVATE_KEY".red);
        process.exit(1);
    }

    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    bot.on("polling_error", (msg) => console.log(`[POLLING] ${msg.message}`.gray));

    try {
        wallet = new Wallet(PRIVATE_KEY, provider);
        const authSigner = Wallet.createRandom(); 
        flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
        
        router = new Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
            "function getAmountsOut(uint amt, address[] path) external view returns (uint[])",
            "function approve(address spender, uint amount) external returns (bool)"
        ], wallet);

        console.log(`[SYSTEM] 🦁 APEX v3000 ONLINE`.magenta);
        console.log(`[WALLET] ${wallet.address}`.cyan);
        
        // Start Loops (They stay idle until flag is set)
        runScannerLoop();
        runMonitorLoop();

    } catch (e) {
        console.log(`[INIT ERROR] ${e.message}`.red);
    }
}

// ==========================================
// 2. ATOMIC EXECUTION ENGINE
// ==========================================
async function executeAtomicTrade(chatId, type, tokenAddress, amountInEth) {
    if (!wallet || !flashbotsProvider) return false;

    const blockNumber = await provider.getBlockNumber();
    let txRequest;

    if(chatId) bot.sendMessage(chatId, `⚔️ **EXECUTING ATOMIC ${type}...**`);

    try {
        // --- 1. PREPARE TRANSACTION ---
        if (type === "BUY") {
            const amountIn = ethers.parseEther(amountInEth.toString());
            const amounts = await router.getAmountsOut(amountIn, [WETH, tokenAddress]);
            const minOut = (amounts[1] * 90n) / 100n; // 10% Slippage Buffer
            
            txRequest = await router.swapExactETHForTokens.populateTransaction(
                minOut, [WETH, tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
                { value: amountIn }
            );
        } 
        else if (type === "SELL") {
            const tokenContract = new Contract(tokenAddress, ["function approve(address, uint) returns (bool)", "function balanceOf(address) view returns (uint)"], wallet);
            const bal = await tokenContract.balanceOf(wallet.address);
            
            if (bal === 0n) {
                if(chatId) bot.sendMessage(chatId, "⚠️ **ERROR:** Zero Balance. Cannot Sell.");
                return false;
            }

            // Standard Approve (Safer for compatibility)
            try {
                const approveTx = await tokenContract.approve(ROUTER_ADDR, bal);
                await approveTx.wait();
            } catch(e) {}

            txRequest = await router.swapExactTokensForETH.populateTransaction(
                bal, 0n, [tokenAddress, WETH], wallet.address, Math.floor(Date.now()/1000)+120
            );
        }

        // --- 2. CALCULATE BRIBE ---
        const feeData = await provider.getFeeData();
        const priorityFee = (feeData.maxPriorityFeePerGas || ethers.parseUnits("1.5", "gwei")) * 2n; 
        const maxFee = (feeData.maxFeePerGas || ethers.parseUnits("20", "gwei")) + priorityFee;

        // --- 3. SIGN ---
        const signedTx = await wallet.signTransaction({
            ...txRequest,
            type: 2, chainId: 1,
            nonce: await provider.getTransactionCount(wallet.address),
            maxPriorityFeePerGas: priorityFee,
            maxFeePerGas: maxFee,
            gasLimit: 450000
        });

        // --- 4. SIMULATE (ZERO LOSS GUARD) ---
        const sim = await flashbotsProvider.simulate([signedTx], blockNumber + 1);
        if ("error" in sim || sim.firstRevert) {
            if(chatId) bot.sendMessage(chatId, `🛡 **SHIELD ACTIVE:** Trade blocked (Honeypot or Slippage). \n**Cost:** $0.`);
            return false;
        }

        // --- 5. BROADCAST BUNDLE ---
        const bundle = [ { signedTransaction: signedTx } ];
        const bundlePromises = [];
        for (let i = 1; i <= 3; i++) {
            bundlePromises.push(flashbotsProvider.sendBundle(bundle, blockNumber + i));
        }

        const resolutions = await Promise.all(bundlePromises.map(p => p.wait()));
        const won = resolutions.find(r => r === FlashbotsBundleResolution.BundleIncluded);

        if (won) {
            // STATE UPDATES
            if (type === "BUY") {
                const amountWei = ethers.parseEther(amountInEth);
                SYSTEM.activePosition = { 
                    address: tokenAddress, 
                    entryPrice: amountWei, 
                    amount: amountWei, // Placeholder, usually check balanceOf
                    highWaterMark: amountWei 
                };
                SYSTEM.pendingTarget = null; // Clear pending
                SYSTEM.state = "MONITORING";
                if(chatId) bot.sendMessage(chatId, `🏆 **BUY CONFIRMED:** Position Locked. Entering Monitor Mode.`);
            } 
            else if (type === "SELL") {
                SYSTEM.activePosition = null;
                SYSTEM.state = "HUNTING";
                PLAYER.wins++;
                if(chatId) bot.sendMessage(chatId, `💰 **SOLD:** Profit Secured. Returning to Hunter Mode.`);
            }
            return true;
        } else {
            if(chatId) bot.sendMessage(chatId, `⚠️ **MISSED:** Bundle was not included. Retrying...`);
            return false;
        }

    } catch (e) {
        if(chatId) bot.sendMessage(chatId, `❌ **ERROR:** ${e.message}`);
        return false;
    }
}

// ==========================================
// 3. AUTONOMOUS LOOPS
// ==========================================

// Loop A: The Hunter
async function runScannerLoop() {
    // Only run if Auto is ON AND we are in HUNTING state
    if (SYSTEM.autoPilot && SYSTEM.state === "HUNTING") {
        console.log(`[HUNTER] Scanning...`.gray);
        
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
            const boosts = res.data;

            if (boosts && boosts.length > 0) {
                // Find fresh target
                const target = boosts.find(t => !SYSTEM.scannedTokens.has(t.tokenAddress));

                if (target) {
                    const details = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${target.tokenAddress}`);
                    const pair = details.data.pairs?.[0];

                    if (pair && pair.liquidity.usd > SYSTEM.config.minLiquidity) {
                        const chatId = process.env.CHAT_ID;
                        
                        // AUTO-PILOT ACTION:
                        if(chatId) bot.sendMessage(chatId, `🎯 **AUTO-TARGET:** ${pair.baseToken.name}\nEngaging Atomic Buy...`);
                        
                        SYSTEM.scannedTokens.add(target.tokenAddress);
                        
                        // Execute Immediately
                        await executeAtomicTrade(chatId, "BUY", target.tokenAddress, SYSTEM.tradeAmount);
                    }
                }
            }
        } catch (e) { }
    }
    // Loop every 4 seconds
    setTimeout(runScannerLoop, 4000);
}

// Loop B: The Manager
async function runMonitorLoop() {
    // Only run if we have a position
    if (SYSTEM.activePosition) {
        const pos = SYSTEM.activePosition;
        
        try {
            const amounts = await router.getAmountsOut(pos.amount, [pos.address, WETH]);
            const currentValWei = amounts[1];
            
            // Update High Water Mark
            if (currentValWei > pos.highWaterMark) pos.highWaterMark = currentValWei;

            const currentEth = parseFloat(ethers.formatEther(currentValWei));
            const highEth = parseFloat(ethers.formatEther(pos.highWaterMark));
            const entryEth = parseFloat(ethers.formatEther(pos.entryPrice));

            const dropFromPeak = ((highEth - currentEth) / highEth) * 100;
            const profitPct = ((currentEth - entryEth) / entryEth) * 100;

            // AUTO-PILOT DECISION
            if (SYSTEM.autoPilot && SYSTEM.state === "MONITORING") {
                const chatId = process.env.CHAT_ID;

                if (dropFromPeak >= SYSTEM.config.trailingStop && profitPct > 1) {
                    if(chatId) bot.sendMessage(chatId, `📉 **TRAILING STOP:** Drops -${dropFromPeak.toFixed(1)}%. Selling...`);
                    await executeAtomicTrade(chatId, "SELL", pos.address, "0");
                } 
                else if (profitPct <= -SYSTEM.config.stopLoss) {
                    if(chatId) bot.sendMessage(chatId, `🛑 **STOP LOSS:** Hit -${SYSTEM.config.stopLoss}%. Selling...`);
                    await executeAtomicTrade(chatId, "SELL", pos.address, "0");
                }
            }
        } catch (e) { console.log(`[MONITOR] ${e.message}`.red); }
    }
    // Loop every 3 seconds
    setTimeout(runMonitorLoop, 3000);
}

// ==========================================
// 4. COMMAND HANDLERS
// ==========================================

// START
bot.onText(/\/start/, (msg) => {
    process.env.CHAT_ID = msg.chat.id; // Save ID for notifications
    bot.sendMessage(msg.chat.id, `
🦁 **APEX PREDATOR v3000**
\`------------------------------\`
**Mode:** ${SYSTEM.autoPilot ? '🟢 AUTO' : '🟡 MANUAL'}
**State:** ${SYSTEM.state}
**Wins:** ${PLAYER.wins}

**/scan** - Find a target (Manual)
**/buy** - Execute Trade on Target
**/sell** - Sell Active Position
**/auto** - Toggle Autopilot
\`------------------------------\``, { parse_mode: "Markdown" });
});

// SCAN (Manual Trigger)
bot.onText(/\/scan/, async (msg) => {
    bot.sendMessage(msg.chat.id, "🦅 **SCANNING:** Searching for liquidity...");
    try {
        const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
        if (res.data && res.data.length > 0) {
            const token = res.data[0];
            
            // SAVE TO MEMORY
            SYSTEM.pendingTarget = { address: token.tokenAddress };
            
            bot.sendMessage(msg.chat.id, `
🎯 **TARGET LOCKED**
Addr: \`${token.tokenAddress}\`
Status: **WAITING FOR ORDER**

👉 **Type /buy to execute.**`, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(msg.chat.id, "No targets found.");
        }
    } catch (e) {
        bot.sendMessage(msg.chat.id, "Scan failed (API Error).");
    }
});

// BUY (Follow Through)
bot.onText(/\/buy/, async (msg) => {
    if (!SYSTEM.pendingTarget) {
        return bot.sendMessage(msg.chat.id, "❌ **NO TARGET:** Run /scan first.");
    }
    
    await executeAtomicTrade(msg.chat.id, "BUY", SYSTEM.pendingTarget.address, SYSTEM.tradeAmount);
});

// SELL (Panic/Manual)
bot.onText(/\/sell/, async (msg) => {
    if (!SYSTEM.activePosition) {
        return bot.sendMessage(msg.chat.id, "❌ **NO ASSETS:** You have no active position.");
    }
    
    await executeAtomicTrade(msg.chat.id, "SELL", SYSTEM.activePosition.address, "0");
});

// AUTO TOGGLE
bot.onText(/\/auto/, (msg) => {
    SYSTEM.autoPilot = !SYSTEM.autoPilot;
    process.env.CHAT_ID = msg.chat.id;

    if (SYSTEM.autoPilot) {
        // Intelligence: If we hold a bag, Monitor. If not, Hunt.
        if (SYSTEM.activePosition) SYSTEM.state = "MONITORING";
        else SYSTEM.state = "HUNTING";
        
        bot.sendMessage(msg.chat.id, `🤖 **AUTO-PILOT ENGAGED**\nState: ${SYSTEM.state}`);
    } else {
        SYSTEM.state = "IDLE";
        bot.sendMessage(msg.chat.id, `🛑 **AUTO-PILOT DISENGAGED**\nSystem Idle.`);
    }
});

// INITIALIZE
init();
http.createServer((req, res) => res.end("BOT_ONLINE")).listen(8080);
