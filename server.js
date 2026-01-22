/**
 * ===============================================================================
 * 🦁 APEX PREDATOR v500.0 (OMNI-PRECOG MERGE)
 * ===============================================================================
 * COMBINES:
 * 1. OMNI-GOVERNOR (Code A): Web AI, MTE Finality Math, Multi-Chain.
 * 2. PRE-COG SNIPER (Code B): Mempool Sniffing, Socket Flood Execution.
 * ===============================================================================
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const axios = require('axios');
const Sentiment = require('sentiment');
const fs = require('fs');
const http = require('http');
require('colors');

// ==========================================
// 0. CONFIGURATION
// ==========================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS; // From Code A
const WSS_NODE_URL = process.env.WSS_NODE_URL; // From Code B (Mempool)

// Router (From Code B)
const UNISWAP_V2 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const UNISWAP_UNIVERSAL = "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Network Definitions (From Code A)
const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC || "https://rpc.mevblocker.io", moat: "0.005", priority: "50.0" },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC || "https://mainnet.base.org", moat: "0.0035", priority: "1.6" },
    ARBITRUM: { chainId: 42161, rpc: process.env.ARB_RPC || "https://arb1.arbitrum.io/rpc", moat: "0.002", priority: "1.0" },
    POLYGON: { chainId: 137, rpc: process.env.POLY_RPC || "https://polygon-rpc.com", moat: "0.001", priority: "200.0" }
};

// Execution Cluster (From Code B)
const EXECUTION_WSS = [
    "wss://rpc.mevblocker.io",
    "wss://eth.llamarpc.com",
    "wss://ethereum.publicnode.com",
    "wss://rpc.ankr.com/eth/ws/none"
];

// Web AI Targets (From Code A)
const AI_SITES = [
    "https://api.dexscreener.com/token-boosts/top/v1",
    "https://api.crypto-ai-signals.com/v1/latest"
];

// ==========================================
// 1. CLOUD BOOT GUARD
// ==========================================
const runHealthServer = () => {
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: "OMNI_PRECOG_ACTIVE" }));
    }).listen(process.env.PORT || 8080);
    console.log(`[SYSTEM] Health Server Active`.green);
};

// ==========================================
// 2. AI & MEMPOOL ENGINE (MERGED)
// ==========================================
class AIEngine {
    constructor(governor) {
        this.governor = governor;
        
        // Code A: Sentiment
        this.trustFile = "trust_scores.json";
        this.sentiment = new Sentiment();
        this.trustScores = this.loadTrust();
        
        // Code B: Mempool
        this.mempoolCounts = {}; 
        this.processedTxHashes = new Set();
        this.HYPE_THRESHOLD = 5;
        this.HYPE_WINDOW_MS = 2000;
    }

    loadTrust() {
        try { return JSON.parse(fs.readFileSync(this.trustFile, 'utf8')); } 
        catch (e) { return { WEB_AI: 0.85, MEMPOOL: 0.95 }; }
    }

    // --- SOURCE 1: WEB AI (Code A) ---
    async analyzeWebIntelligence() {
        const signals = [];
        for (const url of AI_SITES) {
            try {
                const response = await axios.get(url, { timeout: 2000 });
                if (Array.isArray(response.data)) {
                    response.data.slice(0, 3).forEach(token => {
                        if (token.tokenAddress) signals.push({
                            ticker: token.tokenAddress,
                            symbol: token.symbol || "UNKNOWN",
                            source: "WEB_AI"
                        });
                    });
                }
            } catch (e) { continue; }
        }
        return signals;
    }

    // --- SOURCE 2: MEMPOOL LISTENER (Code B) ---
    startMempoolListener() {
        if (!WSS_NODE_URL) {
            console.log(`[WARN] No WSS_NODE_URL! Pre-Cog Disabled.`.red);
            return;
        }
        console.log(`[MEMPOOL] 📡 Connecting to Hype Stream...`.cyan);
        const ws = new WebSocket(WSS_NODE_URL); 

        ws.on('open', () => {
            console.log(`[MEMPOOL] ✅ Connected. Scanning for Hype...`.green);
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newPendingTransactions"] }));
        });

        ws.on('message', async (data) => {
            try {
                const response = JSON.parse(data);
                if (response.method === "eth_subscription") {
                    const txHash = response.params.result;
                    if (this.processedTxHashes.has(txHash)) return;
                    this.processedTxHashes.add(txHash);
                    if (this.processedTxHashes.size > 5000) this.processedTxHashes.clear();

                    // Note: This relies on ETH provider from Governor
                    const provider = this.governor.providers.ETHEREUM;
                    if(!provider) return;
                    
                    // We try-catch the fetch to avoid crashing on rate limits
                    const tx = await provider.getTransaction(txHash).catch(() => null);
                    if (tx && tx.to && tx.data) this.processPendingTx(tx);
                }
            } catch (e) {}
        });

        ws.on('error', () => setTimeout(() => this.startMempoolListener(), 5000));
    }

    processPendingTx(tx) {
        const to = tx.to.toLowerCase();
        if (to !== UNISWAP_UNIVERSAL.toLowerCase() && to !== UNISWAP_V2.toLowerCase()) return;

        const data = tx.data.toLowerCase();
        const matches = data.match(/0x[a-f0-9]{40}/g);

        if (matches) {
            for (const addr of matches) {
                if (addr !== WETH.toLowerCase() && addr !== UNISWAP_UNIVERSAL.toLowerCase() && addr !== UNISWAP_V2.toLowerCase()) {
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
        this.mempoolCounts[tokenAddress] = this.mempoolCounts[tokenAddress].filter(t => now - t < this.HYPE_WINDOW_MS);

        if (this.mempoolCounts[tokenAddress].length >= this.HYPE_THRESHOLD) {
            console.log(`[PRE-COG] 🚨 HYPE DETECTED: ${tokenAddress}`.bgRed.white);
            this.governor.executeStrike("ETHEREUM", { ticker: tokenAddress, symbol: "PRE-COG" }, "MEMPOOL");
            this.mempoolCounts[tokenAddress] = []; 
        }
    }
}

// ==========================================
// 3. OMNI GOVERNOR (The Controller)
// ==========================================
class ApexOmniGovernor {
    constructor() {
        this.ai = new AIEngine(this);
        this.providers = {};
        this.wallets = {};
        this.flashbots = null;
        
        // Initialize Execution Sockets (From Code B)
        this.execSockets = [];
        EXECUTION_WSS.forEach(url => {
            try {
                const ws = new WebSocket(url);
                ws.on('open', () => this.execSockets.push(ws));
                ws.on('error', () => {}); 
            } catch (e) {}
        });

        // Setup Networks
        for (const [name, config] of Object.entries(NETWORKS)) {
            try {
                const network = ethers.Network.from(config.chainId);
                const provider = new ethers.JsonRpcProvider(config.rpc, network, { staticNetwork: network });
                this.providers[name] = provider;
                if (PRIVATE_KEY) this.wallets[name] = new ethers.Wallet(PRIVATE_KEY, provider);
            } catch (e) { console.error(`[${name}] Init Fail`.red); }
        }

        // Init Flashbots (ETH Only)
        if (this.providers.ETHEREUM && PRIVATE_KEY) {
            FlashbotsBundleProvider.create(this.providers.ETHEREUM, new ethers.Wallet(PRIVATE_KEY, this.providers.ETHEREUM), "https://relay.flashbots.net")
                .then(fb => { this.flashbots = fb; console.log(`[INIT] ☢️ FLASHBOTS ACTIVE`.magenta); });
        }

        this.ai.startMempoolListener();
    }

    // --- EXECUTION LOGIC (MERGED: Code A Math + Code B Delivery) ---
    async executeStrike(networkName, tokenSignal, source) {
        if (!this.wallets[networkName]) return;
        const provider = this.providers[networkName];
        const wallet = this.wallets[networkName];
        const config = NETWORKS[networkName];

        // 1. MTE Finality Math (From Code A)
        const [balance, feeData] = await Promise.all([provider.getBalance(wallet.address), provider.getFeeData()]);
        const gasPrice = feeData.gasPrice || ethers.parseUnits("0.01", "gwei");
        
        // Nuclear Gas Calculation (Code B logic applied to Code A structure)
        const priorityFee = ethers.parseUnits(config.priority || "50.0", "gwei"); 
        const executionFee = (gasPrice * 120n / 100n) + priorityFee;
        
        // Overhead Calculation (Code A)
        const overhead = (2000000n * executionFee) + ethers.parseEther(config.moat) + 100000n;

        if (balance < overhead) return; // Silent fail

        // Absolute Volume Loan (Code A)
        const premium = balance - overhead;
        const loan = (premium * 10000n) / 9n; // "All-in" trade size

        console.log(`[${networkName}]`.green + ` STRIKING ${tokenSignal.symbol} | Vol: ${ethers.formatEther(loan)}`);

        // 2. Transaction Construction
        let txRequest;
        
        // If EXECUTOR exists, use Code A logic (Smart Contract)
        if (EXECUTOR_ADDRESS && networkName !== 'ETHEREUM') { 
            const abi = ["function executeComplexPath(string[] path, uint256 amount) external payable"];
            const contract = new ethers.Contract(EXECUTOR_ADDRESS, abi, wallet);
            txRequest = await contract.executeComplexPath.populateTransaction(
                [ethers.ZeroAddress, tokenSignal.ticker, ethers.ZeroAddress], 
                loan, 
                { value: premium, gasLimit: 2000000, maxFeePerGas: executionFee, maxPriorityFeePerGas: priorityFee }
            );
        } else {
            // If no Executor or on ETH (Mempool Snipe), use Code B logic (Router Swap)
            const router = new ethers.Contract(UNISWAP_V2, [
                "function swapExactETHForTokens(uint min, address[] path, address to, uint dead) external payable returns (uint[])"
            ], wallet);
            
            txRequest = await router.swapExactETHForTokens.populateTransaction(
                0n, // YOLO Slippage (Code B style)
                [WETH, tokenSignal.ticker],
                wallet.address,
                Math.floor(Date.now()/1000)+120,
                { value: premium, gasLimit: 300000, maxFeePerGas: executionFee, maxPriorityFeePerGas: priorityFee }
            );
        }

        txRequest.nonce = await wallet.getNonce('pending');
        const signedTx = await wallet.signTransaction(txRequest);
        const txHash = ethers.keccak256(signedTx);

        // 3. NUCLEAR DELIVERY (Code B: Socket Flood + Flashbots)
        this.nuclearBroadcast(networkName, signedTx, txHash);
    }

    async nuclearBroadcast(networkName, signedTx, txHash) {
        // A. Socket Flood (Code B)
        const wsPayload = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [signedTx] });
        
        // Loop for 5 seconds (Code B "Kill Loop")
        const killLoop = setInterval(() => {
            this.execSockets.forEach(ws => {
                if (ws.readyState === WebSocket.OPEN) ws.send(wsPayload);
            });
        }, 100); // 100ms interval from Code B

        // B. Flashbots (Code B)
        if (networkName === 'ETHEREUM' && this.flashbots) {
            const block = await this.providers.ETHEREUM.getBlockNumber();
            const bundle = [{ signedTransaction: signedTx }];
            this.flashbots.sendBundle(bundle, block + 1).catch(()=>{});
            this.flashbots.sendBundle(bundle, block + 2).catch(()=>{});
        }

        // C. Standard Broadcast (Code A fallback)
        try {
            const tx = await this.providers[networkName].broadcastTransaction(signedTx);
            console.log(`🚀 [${networkName}] Sent: ${tx.hash}`);
            await tx.wait(1);
            console.log(`✅ [${networkName}] Confirmed`.gold);
            clearInterval(killLoop);
        } catch (e) {
            setTimeout(() => clearInterval(killLoop), 10000); // Stop flood after 10s
        }
    }

    async run() {
        console.log("╔════════════════════════════════════════════════════════╗".gold);
        console.log("║    ⚡ APEX PREDATOR v500.0 | OMNI-PRECOG MERGE       ║".gold);
        console.log("╚════════════════════════════════════════════════════════╝".gold);

        while (true) {
            // 1. Web AI Scan (Code A)
            const signals = await this.ai.analyzeWebIntelligence();
            
            // 2. Execute Web Signals
            for (const net of Object.keys(NETWORKS)) {
                for (const s of signals) {
                    await this.executeStrike(net, s, "WEB_AI");
                }
            }

            // 3. 100ms Loop (Code B Speed)
            await new Promise(r => setTimeout(r, 100));
        }
    }
}

// ==========================================
// 4. IGNITION
// ==========================================
runHealthServer();
const governor = new ApexOmniGovernor();
governor.run().catch(err => {
    console.error("FATAL:".red, err.message);
});
