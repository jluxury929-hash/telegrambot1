require('dotenv').config();
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- 1. SEED PHRASE WALLET DERIVATION ---
const getWalletFromMnemonic = () => {
    try {
        const mnemonic = (process.env.SEED_PHRASE || "").trim().replace(/["']/g, "");
        
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error("Invalid Mnemonic Phrase. Check your 12/24 words in .env");
        }

        // 1. Generate seed from mnemonic
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        
        // 2. Standard Solana derivation path (Phantom, Solflare, etc.)
        const path = "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        
        // 3. Create Keypair from the derived seed
        return Keypair.fromSeed(derivedSeed);
    } catch (e) {
        console.error(`❌ WALLET ERROR: ${e.message}`);
        process.exit(1);
    }
};

const wallet = getWalletFromMnemonic();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
const LUNAR_API_KEY = process.env.LUNAR_API_KEY;

// --- 2. THE AI SENTIMENT PULSE ---
async function getGlobalPulse() {
    try {
        const url = `https://api.lunarcrush.com/v2?data=assets&symbol=SOL&key=${LUNAR_API_KEY}`;
        const res = await axios.get(url);
        const data = res.data.data[0];
        return { score: data.galaxy_score, price: data.price };
    } catch (e) { return null; }
}

// --- 3. EXECUTION ENGINE (JUPITER V6) ---
async function executeRealSwap(amountSOL) {
    try {
        const quoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${amountSOL * 1e9}&slippageBps=50`);
        const quote = quoteRes.data;

        const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quote,
            userPublicKey: wallet.publicKey.toBase58(),
            wrapAndUnwrapSol: true
        });

        const transaction = VersionedTransaction.deserialize(Buffer.from(swapRes.data.swapTransaction, 'base64'));
        transaction.sign([wallet]);
        
        const txid = await connection.sendTransaction(transaction);
        console.log(`✅ TRADE SUCCESS: https://solscan.io/tx/${txid}`);
    } catch (err) {
        console.error("❌ Swap Failed:", err.message);
    }
}

// --- 4. THE 5-SECOND HEARTBEAT ---
console.log(`🤖 Bot Active for Address: ${wallet.publicKey.toBase58()}`);

setInterval(async () => {
    const pulse = await getGlobalPulse();
    if (pulse && pulse.score >= 75) {
        console.log(`🔥 BULLISH SIGNAL: Score ${pulse.score} | Price: $${pulse.price.toFixed(2)}`);
        await executeRealSwap(0.1); 
    } else {
        process.stdout.write(`\r[${new Date().toLocaleTimeString()}] Pulse: ${pulse?.score || '??'} (Waiting)...`);
    }
}, 5000);
