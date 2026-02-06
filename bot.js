require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');

// --- 1. SAFE CONFIGURATION LOADER ---
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

const getWallet = () => {
    // This removes quotes and extra spaces that cause the "Non-base58 character" error
    const rawKey = (process.env.TRADER_PRIVATE_KEY || "").trim().replace(/["']/g, "");
    try {
        if (rawKey.startsWith('[')) {
            // Case: Key is a byte array like [12, 45, ...]
            return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(rawKey)));
        }
        // Case: Key is a Base58 string
        return Keypair.fromSecretKey(bs58.decode(rawKey));
    } catch (e) {
        console.error("❌ ERROR: Private key is invalid. Check your .env file.");
        process.exit(1);
    }
};

const wallet = getWallet();
const LUNAR_API_KEY = process.env.LUNAR_API_KEY;

// --- 2. AI SENTIMENT PULSE (The "World's Best Data") ---
async function getGlobalPulse() {
    try {
        const url = `https://api.lunarcrush.com/v2?data=assets&symbol=SOL&key=${LUNAR_API_KEY}`;
        const res = await axios.get(url);
        const data = res.data.data[0];
        return { score: data.galaxy_score, price: data.price };
    } catch (e) { return null; }
}

// --- 3. REAL EXECUTION ENGINE (JUPITER V6) ---
async function executeRealSwap(amountSOL) {
    try {
        // A. Get Quote from Jupiter AI Router
        const quoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${amountSOL * 1e9}&slippageBps=50`);
        const quote = quoteRes.data;

        // B. Get Serialized Transaction
        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        });

        const { swapTransaction } = swapRes.data;

        // C. Sign and Send
        const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        transaction.sign([wallet]);
        
        const txid = await connection.sendTransaction(transaction);
        console.log(`✅ TRADE SUCCESS: https://solscan.io/tx/${txid}`);
    } catch (err) {
        console.error("❌ Swap Failed:", err.message);
    }
}

// --- 4. THE 5-SECOND HEARTBEAT ---
console.log(`🤖 Bot Active for: ${wallet.publicKey.toBase58()}`);

setInterval(async () => {
    const pulse = await getGlobalPulse();
    if (pulse && pulse.score >= 75) {
        console.log(`🔥 BULLISH SIGNAL: Score ${pulse.score} | Price: $${pulse.price.toFixed(2)}`);
        await executeRealSwap(0.1); // Trade 0.1 SOL
    } else {
        process.stdout.write(`\r[${new Date().toLocaleTimeString()}] Pulse: ${pulse?.score || '??'} (Waiting)...`);
    }
}, 5000);
