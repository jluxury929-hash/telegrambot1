/**
 * ===============================================================================
 * 🦁 APEX PREDATOR: OMEGA TOTALITY v3000.0 [FINAL CORRECTED FUSION]
 * ===============================================================================
 * COMMANDS:
 * /scan  -> Find trending alpha, lock in RAM.
 * /buy   -> Execute Strike on locked target (or /buy <address>).
 * /sell  -> Panic sell current active position.
 * /auto  -> Toggle full autonomous loop (Scan -> Buy -> Monitor -> Sell).
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
const ROUTER_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; 
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// --- GLOBAL STATE ---
const provider = new JsonRpcProvider(RPC_URL);
let wallet = null;
let router = null;
let flashbotsProvider = null;
let bot = null;

let SYSTEM = {
    autoPilot: false,
    state: "IDLE", // IDLE, HUNTING, MONITORING
    tradeAmount: "0.02", // Set your ETH strike amount
    pendingTarget: null,   // Memory for manual /buy
    activePosition: null,  // Memory for /sell
    scannedTokens: new Set(),
    config: {
        trailingStop: 10,  // % drop from peak to sell
        stopLoss: 15,      // % drop from entry to sell
        minLiquidity: 30000 
    }
};

let PLAYER = {
    level: 1, xp: 0, nextLevelXp: 1000, class: "HUNTING CUB",
    totalProfitEth: 0.0, wins: 0
};

// ==========================================
// 1. INITIALIZATION
// ==========================================
async function startSystem() {
    if (!TELEGRAM_TOKEN || !PRIVATE_KEY) {
        console.log("❌ ERROR: Missing config in .env".red);
        process.exit(1);
    }

    bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
    
    try {
        wallet = new Wallet(PRIVATE_KEY, provider);
        const authSigner = Wallet.createRandom(); 
        flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner);
        
        router = new Contract(ROUTER_ADDR, [
            "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint dead) external returns (uint[])",
            "function getAmountsOut(uint amt, address[] path) external view returns (uint[])"
        ], wallet);

        console.log(`[SYSTEM] 🦁 APEX v3000 ONLINE`.magenta);
        console.log(`[WALLET] ${wallet.address}`.cyan);
        
        // Start Loops
        runScannerLoop();
        runMonitorLoop();

    } catch (e) { console.log(`[INIT ERROR] ${e.message}`.red); }
}

// ==========================================
// 2. ATOMIC EXECUTION CORE
// ==========================================
async function executeAtomicTrade(chatId, type, tokenAddress, amountInEth) {
    if (!wallet || !flashbotsProvider) return false;

    const blockNumber = await provider.getBlockNumber();
    let txRequest;

    if(chatId) bot.sendMessage(chatId, `⚔️ **INITIATING ATOMIC ${type}...**`);

    try {
        if (type === "BUY") {
            const amountIn = ethers.parseEther(amountInEth.toString());
            const amounts = await router.getAmountsOut(amountIn, [WETH, tokenAddress]);
            const minOut = (amounts[1] * 90n) / 100n; // 10% Slippage Buffer
            
            txRequest = await router.swapExactETHForTokens.populateTransaction(
                minOut, [WETH, tokenAddress], wallet.address, Math.floor(Date.now()/1000)+120,
                { value: amountIn }
            );
        } else {
            const tokenContract = new Contract(tokenAddress, ["function approve(address, uint) returns (bool)", "function balanceOf(address) view returns (uint)"], wallet);
            const bal = await tokenContract.balanceOf(wallet.address);
            if (bal === 0n) return bot.sendMessage(chatId, "❌ Balance 0.");

            // Standard Approval
            try { const tx = await tokenContract.approve(ROUTER_ADDR, bal); await tx.wait(); } catch(e){}

            txRequest = await router.swapExactTokensForETH.populateTransaction(
                bal, 0n, [tokenAddress, WETH], wallet.address, Math.floor(Date.now()/1000)+120
            );
        }

        // Bribe Calculation
        const feeData = await provider.getFeeData();
        const priorityFee = (feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei")) * 2n; 
        const maxFee = (feeData.maxFeePerGas || ethers.parseUnits("15", "gwei")) + priorityFee;

        const signedTx = await wallet.signTransaction({
            ...txRequest, type: 2, chainId: 1,
            nonce: await provider.getTransactionCount(wallet.address),
            maxPriorityFeePerGas: priorityFee, maxFeePerGas: maxFee, gasLimit: 400000
        });

        // Simulation Safeguard
        const sim = await flashbotsProvider.simulate([signedTx], blockNumber + 1);
        if ("error" in sim || sim.firstRevert) {
            if(chatId) bot.sendMessage(chatId, `🛡 **SHIELD:** Revert detected. Trade blocked. $0 Gas spent.`);
            return false;
        }

        // Send Bundle
        const bundle = [ { signedTransaction: signedTx } ];
        const bundlePromises = [];
        for (let i = 1; i <= 3; i++) { bundlePromises.push(flashbotsProvider.sendBundle(bundle, blockNumber + i)); }

        const resolutions = await Promise.all(bundlePromises.map(p => p.wait()));
        const won = resolutions.find(r => r === FlashbotsBundleResolution.BundleIncluded);

        if (won) {
            if(chatId) bot.sendMessage(chatId, `🏆 **WIN:** Atomic ${type} successful!`);
            if (type === "BUY") {
                SYSTEM.activePosition = { address: tokenAddress, entry: amountInEth, highWaterMark: amountInEth };
                SYSTEM.state = "MONITORING";
            } else {
                SYSTEM.activePosition = null;
                SYSTEM.state = "HUNTING";
            }
            return true;
        }
        return false;
    } catch (e) { if(chatId) bot.sendMessage(chatId, `❌ Error: ${e.message}`); return false; }
}

// ==========================================
// 3. AUTO-PILOT LOOPS
// ==========================================
async function runScannerLoop() {
    if (SYSTEM.autoPilot && SYSTEM.state === "HUNTING") {
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
            const target = res.data.find(t => !SYSTEM.scannedTokens.has(t.tokenAddress));
            if (target) {
                const details = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${target.tokenAddress}`);
                const pair = details.data.pairs?.[0];
                if (pair && pair.liquidity.usd > SYSTEM.config.minLiquidity) {
                    const chatId = process.env.CHAT_ID;
                    SYSTEM.scannedTokens.add(target.tokenAddress);
                    await executeAtomicTrade(chatId, "BUY", target.tokenAddress, SYSTEM.tradeAmount);
                }
            }
        } catch (e) {}
    }
    setTimeout(runScannerLoop, 5000);
}

async function runMonitorLoop() {
    if (SYSTEM.activePosition) {
        try {
            const pos = SYSTEM.activePosition;
            const amounts = await router.getAmountsOut(ethers.parseUnits("1", 18), [pos.address, WETH]); // Rough price
            const currentEth = parseFloat(ethers.formatEther(amounts[1]));
            
            if (currentEth > pos.highWaterMark) pos.highWaterMark = currentEth;
            const drop = ((pos.highWaterMark - currentEth) / pos.highWaterMark) * 100;

            if (SYSTEM.autoPilot && drop >= SYSTEM.config.trailingStop) {
                await executeAtomicTrade(process.env.CHAT_ID, "SELL", pos.address, "0");
            }
        } catch (e) {}
    }
    setTimeout(runMonitorLoop, 3000);
}

// ==========================================
// 4. TELEGRAM COMMANDS
// ==========================================
startSystem().then(() => {
    bot.onText(/\/start/, (msg) => {
        process.env.CHAT_ID = msg.chat.id;
        bot.sendMessage(msg.chat.id, `🦁 **APEX v3000 ONLINE**\n/scan -> Find Target\n/buy -> Strike Locked\n/sell -> Exit\n/auto -> Autonomous Loop`);
    });

    bot.onText(/\/scan/, async (msg) => {
        bot.sendMessage(msg.chat.id, "🦅 **SCANNING...**");
        try {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/top/v1');
            const token = res.data[0];
            SYSTEM.pendingTarget = token.tokenAddress;
            bot.sendMessage(msg.chat.id, `🎯 **TARGET LOCKED:** \`${token.tokenAddress}\`\nType **/buy** to strike!`);
        } catch (e) { bot.sendMessage(msg.chat.id, "Scan Error."); }
    });

    bot.onText(/\/buy(?:\s+(.+))?/, async (msg, match) => {
        const addr = match[1] || SYSTEM.pendingTarget;
        if (!addr) return bot.sendMessage(msg.chat.id, "❌ No target locked.");
        await executeAtomicTrade(msg.chat.id, "BUY", addr, SYSTEM.tradeAmount);
    });

    bot.onText(/\/sell/, async (msg) => {
        if (!SYSTEM.activePosition) return bot.sendMessage(msg.chat.id, "❌ No position.");
        await executeAtomicTrade(msg.chat.id, "SELL", SYSTEM.activePosition.address, "0");
    });

    bot.onText(/\/auto/, (msg) => {
        SYSTEM.autoPilot = !SYSTEM.autoPilot;
        SYSTEM.state = SYSTEM.autoPilot ? (SYSTEM.activePosition ? "MONITORING" : "HUNTING") : "IDLE";
        bot.sendMessage(msg.chat.id, `🤖 **AUTO-PILOT:** ${SYSTEM.autoPilot ? 'ON' : 'OFF'}`);
    });
});

// KEEP-ALIVE
http.createServer((req, res) => res.end("APEX")).listen(8080);
