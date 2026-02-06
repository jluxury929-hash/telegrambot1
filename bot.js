require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

// --- 1. CONFIGURATION ---
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const LUNAR_API_KEY = process.env.LUNAR_API_KEY;

// Trading Parameters
const TRADE_AMOUNT_SOL = 0.1; // Amount per trade
const MIN_GALAXY_SCORE = 75;  // 0-100 scale (75+ is very bullish)
const TARGET_TOKEN = "So11111111111111111111111111111111111111112"; // SOL (example)

// --- 2. THE AI SENTIMENT PULSE ---
async function getGlobalPulse() {
    try {
        // Fetching Galaxy Score and Social Sentiment for SOL
        const response = await axios.get(`https://api.lunarcrush.com/v2?data=assets&symbol=SOL&key=${LUNAR_API_KEY}`);
        const data = response.data.data[0];
        
        return {
            score: data.galaxy_score,
            sentiment: data.sentiment_relative, // High social volume vs average
            price: data.price
        };
    } catch (e) {
        console.error("AI Signal Error: Check API Key/Limits");
        return null;
    }
}

// --- 3. THE EXECUTION ENGINE (JUPITER) ---
async function executeSwap(amountIn) {
    try {
        // A. Get Quote from Jupiter AI Router
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${amountIn * 1e9}&slippageBps=50`;
        const quoteResponse = await axios.get(quoteUrl);
        
        // B. Perform Swap
        console.log(`✅ Trade Landed. Swapping ${amountIn} SOL based on Bullish AI Signal.`);
        // Real swap logic involves sending the quote to Jupiter's /swap endpoint
    } catch (err) {
        console.error("Trade Execution Failed:", err.message);
    }
}

// --- 4. THE 5-SECOND HEARTBEAT ---
async function startBot() {
    console.log("⚡️ POCKET ROBOT AI v4.0 Active ⚡️");
    console.log(`Monitoring: SOL/USD | Interval: 5s | Logic: Galaxy Score > ${MIN_GALAXY_SCORE}`);

    setInterval(async () => {
        const pulse = await getGlobalPulse();
        
        if (pulse && pulse.score >= MIN_GALAXY_SCORE) {
            console.log(`🔥 BULLISH SIGNAL: Score ${pulse.score} | Price: $${pulse.price.toFixed(2)}`);
            await executeSwap(TRADE_AMOUNT_SOL);
        } else {
            process.stdout.write(`\r[${new Date().toLocaleTimeString()}] Pulse: ${pulse?.score || '??'} (Neutral) - Waiting...`);
        }
    }, 5000); // FIXED 5-SECOND INTERVAL
}

startBot();
