/**
 * ===============================================================================
 * APEX PREDATOR TITAN v400.1 (Hybrid Flash + Telegram)
 * ===============================================================================
 * Telegram Bot Integration: t.me/ApexPredatorFlashBot
 * API TOKEN: 8041662519:AAE3NRrjFJsOQzmfxkx5OX5A-X-ACVaP0Qk
 * ===============================================================================
 */

require('dotenv').config();
const { ethers, Wallet, Contract, JsonRpcProvider } = require('ethers');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const cluster = require('cluster');
const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
const TelegramBot = require('node-telegram-bot-api');
require('colors');

// ==========================================
// 0. CONFIG & SAFETY CHECKS
// ==========================================
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = process.env.EXECUTOR_ADDRESS;
const TELEGRAM_TOKEN = "7903779688:AAGFMT3fWaYgc9vKBhxNQRIdB5AhmX0U9Nw";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// SAFETY CHECK: Validate addresses before starting
if (!PRIVATE_KEY || PRIVATE_KEY.length !== 66 || !PRIVATE_KEY.startsWith("0x")) {
    console.error("❌ FATAL ERROR: Invalid PRIVATE_KEY in .env file.".red);
    process.exit(1);
}

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://eth.llamarpc.com", wss: process.env.ETH_WSS, relay: "https://relay.flashbots.net" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC || "https://mainnet.base.org", wss: process.env.BASE_WSS },
    ARBITRUM: { chainId: 42161, rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc", wss: process.env.ARB_WSS },
    POLYGON: { chainId: 137, rpc: process.env.POLY_RPC || "https://polygon-rpc.com", wss: process.env.POLY_WSS }
};

const AI_SITES = ["https://api.crypto-ai-signals.com/v1/latest", "https://top-trading-ai-blog.com/alerts"];
let ACTIVE_SIGNALS = [];
let MINER_BRIBE = 50;
let SIMULATION_MODE = { enabled: true };

// ==========================================
// 1. TELEGRAM BOT (Primary Only)
// ==========================================
let bot = null;

// ==========================================
// 2. AI ENGINE
// ==========================================
class AIEngine {
    constructor() {
        this.sentiment = new Sentiment();
        this.trustFile = "trust_scores.json";
        this.trustScores = this.loadTrust();
    }

    loadTrust() {
        if (fs.existsSync(this.trustFile)) {
            try { return JSON.parse(fs.readFileSync(this.trustFile, 'utf8')); } catch (e) { return { WEB_AI: 0.85 }; }
        }
        return { WEB_AI: 0.85 };
    }

    updateTrust(source, success) {
        let current = this.trustScores[source] || 0.5;
        current = success ? Math.min(0.99, current * 1.05) : Math.max(0.1, current * 0.9);
        this.trustScores[source] = current;
        fs.writeFileSync(this.trustFile, JSON.stringify(this.trustScores));
        return current;
    }

    async scanSignals() {
        const signals = [];
        for (const url of AI_SITES) {
            try {
                const res = await axios.get(url, { timeout: 5000 });
                const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                const analysis = this.sentiment.analyze(text);
                const tickers = text.match(/\$[A-Z]+/g);
                if (tickers && analysis.comparative > 0.1) {
                    const ticker = tickers[0].replace('$', '');
                    if (!signals.find(s => s.ticker === ticker)) signals.push({ ticker, confidence: analysis.comparative, source: "WEB_AI" });
                }
            } catch (e) { }
        }
        ACTIVE_SIGNALS = signals;
        if (bot && signals.length > 0) bot.sendMessage(TELEGRAM_CHAT_ID, `🧠 AI UPDATE: ${signals.map(s => s.ticker).join(',')}`);
        return signals;
    }
}

// ==========================================
// 3. MASTER / WORKER LOGIC
// ==========================================
if (cluster.isPrimary) {
    console.clear();
    console.log(`╔════════════════════════════════╗`.gold);
    console.log(`║ ⚡ APEX PREDATOR TITAN v400.1 ║`.gold);
    console.log(`╚════════════════════════════════╝`.gold);

    try {
        bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
        bot.on('polling_error', (error) => {
            if (error.code === 'ETELEGRAM' && error.message.includes('Conflict')) {
                console.log("[TELEGRAM] Conflict error: Another instance is running.".yellow);
            } else {
                console.log(`[TELEGRAM] Error: ${error.message}`.yellow);
            }
        });

        bot.onText(/\/flashloan (on|off)/, (msg, match) => {
            const mode = match[1] === 'on';
            SIMULATION_MODE.enabled = !mode;
            bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Flashloan mode ${mode ? 'ON' : 'OFF'}`);
        });
        bot.onText(/\/simulate (on|off)/, (msg, match) => {
            const mode = match[1] === 'on';
            SIMULATION_MODE.enabled = mode;
            bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Simulation mode ${mode ? 'ON' : 'OFF'}`);
        });
        bot.onText(/\/bribe (\d+)/, (msg, match) => {
            const bribe = parseInt(match[1]);
            if (bribe >= 0 && bribe <= 99) {
                MINER_BRIBE = bribe;
                bot.sendMessage(TELEGRAM_CHAT_ID, `✅ Miner bribe updated to ${bribe}%`);
            } else bot.sendMessage(TELEGRAM_CHAT_ID, `❌ Invalid bribe, must be 0-99`);
        });
    } catch (e) { console.log("[TELEGRAM] Failed to init bot on primary.".red); }

    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ engine: "APEX PREDATOR TITAN", version: "v400.1", simulation: SIMULATION_MODE.enabled }));
    }).listen(8080, () => console.log("[SYSTEM] Health server active on 8080".cyan));

    const workerMap = {}; 
    const spawnWorker = (chain) => {
        const worker = cluster.fork({ CHAIN: chain });
        workerMap[worker.id] = chain;
    };

    Object.keys(NETWORKS).forEach(chain => spawnWorker(chain));

    cluster.on('exit', (worker) => {
        const chain = workerMap[worker.id];
        console.log(`Worker ${worker.process.pid} (${chain}) died, respawning...`.red);
        if (chain) {
            delete workerMap[worker.id];
            spawnWorker(chain);
        }
    });

} else {
    runWorker(process.env.CHAIN);
}

// ==========================================
// 4. WORKER FUNCTION
// ==========================================
async function runWorker(chainName) {
    if (!chainName) return; 
    
    // Worker bot instance for sending messages only (no polling)
    const workerBot = new TelegramBot(TELEGRAM_TOKEN, { polling: false }); 
    
    const config = NETWORKS[chainName];
    const provider = new JsonRpcProvider(config.rpc, config.chainId);
    const wallet = new Wallet(PRIVATE_KEY, provider);
    
    // Use dummy address check to prevent crash if not deployed
    let executorContract;
    if(ethers.isAddress(EXECUTOR)) {
        executorContract = new Contract(EXECUTOR, ["function executeComplexPath(string[] path,uint256 amount) external payable"], wallet);
    }

    const ai = new AIEngine();

    let flashbots = null;
    if (chainName === "ETHEREUM") {
        try {
            const authSigner = Wallet.createRandom();
            flashbots = await FlashbotsBundleProvider.create(provider, authSigner, "https://relay.flashbots.net");
        } catch (e) { console.log(`[${chainName}] Flashbots Init Fail: ${e.message}`.red); }
    }

    // FIX: Robust WebSocket handling to prevent crash on HTTP URLs
    if (config.wss && config.wss.startsWith('wss://')) {
        try {
            const ws = new WebSocket(config.wss);
            
            // CRITICAL: Error handler prevents process crash
            ws.on('error', (err) => {
                console.log(`[${chainName}] WebSocket Error (Safe): ${err.message}`.yellow);
            });

            ws.on('open', () => console.log(`[${chainName}] WebSocket Connected`.cyan));
            
            ws.on('message', async data => {
                try {
                    const payload = JSON.parse(data);
                    if (payload.params && payload.params.result) {
                        const signals = ACTIVE_SIGNALS.length > 0 ? ACTIVE_SIGNALS : [{ ticker: "DISCOVERY", confidence: 0.5, source: "DISCOVERY" }];
                        for (const sig of signals) {
                            if(executorContract) {
                                await strike(provider, wallet, executorContract, chainName, sig.ticker, sig.confidence, sig.source, flashbots, ai, workerBot);
                            }
                        }
                    }
                } catch (e) { }
            });
        } catch (e) {
            console.log(`[${chainName}] WebSocket Setup Failed: ${e.message}`.yellow);
        }
    } else if (config.wss) {
        console.log(`[${chainName}] Skipping invalid WSS URL (Must start with wss://)`.yellow);
    }

    setInterval(async () => { await ai.scanSignals(); }, 5000);
}

// ==========================================
// 5. STRIKE LOGIC
// ==========================================
async function strike(provider, wallet, contract, chain, ticker, confidence, source, flashbots, ai, botInstance) {
    try {
        const balance = await provider.getBalance(wallet.address);
        const overhead = ethers.parseEther("0.01");
        if (balance < overhead) return;

        let tradeAmount = balance - overhead;
        tradeAmount = SIMULATION_MODE.enabled ? tradeAmount / 10n : tradeAmount;

        const path = ["ETH", ticker, "ETH"];
        const txData = await contract.populateTransaction.executeComplexPath(path, tradeAmount, { value: overhead, gasLimit: 1500000n });

        if (SIMULATION_MODE.enabled) {
            botInstance.sendMessage(TELEGRAM_CHAT_ID, `🧪 SIMULATION: ${chain} | Path: ${path.join("->")} | Amt: ${ethers.formatEther(tradeAmount)} ETH | AI Conf: ${(confidence * 100).toFixed(1)}%`);
            return;
        }

        if (flashbots && chain === "ETHEREUM") {
            const bundle = [{ signer: wallet, transaction: txData }];
            const block = await provider.getBlockNumber() + 1;
            await flashbots.sendBundle(bundle, block);
        } else {
            const txResp = await wallet.sendTransaction(txData);
            botInstance.sendMessage(TELEGRAM_CHAT_ID, `✅ TRADE: ${chain} | Path: ${path.join("->")} | Tx: ${txResp.hash} | AI Conf: ${(confidence * 100).toFixed(1)}% | Bribe: ${MINER_BRIBE}%`);
            await txResp.wait(1);
        }

        if (ai) ai.updateTrust(source, true);
    } catch (e) {
        if(!e.message.includes("insufficient funds")) console.log(`[${chain}] Strike Error: ${e.message}`.red);
        if (ai) ai.updateTrust(source, false);
    }
}
