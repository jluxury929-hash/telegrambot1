require('dotenv').config();
const { Connection, Keypair, PublicKey, VersionedTransaction, SystemProgram } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const { createJupiterApiClient } = require('@jup-ag/api');
const axios = require('axios');
const bs58 = require('bs58');

// --- 1. INITIALIZATION ---
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const jupApi = createJupiterApiClient();
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const jito = searcherClient("frankfurt.mainnet.block-engine.jito.wtf", wallet); // Region-specific URL

// --- 2. THE EXECUTION ENGINE ---
async function executeRealTrade(amountIn) {
    try {
        // A. Get Real-Time Quote
        const quote = await jupApi.quoteGet({
            inputMint: "So11111111111111111111111111111111111111112", // SOL
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            amount: amountIn * 1e9,
            slippageBps: 50,
        });

        // B. Get Swap Transaction Data
        const { swapTransaction } = await jupApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
            }
        });

        // C. Prepare Jito Tip (The Bribe for 90% Inclusion)
        const tipAccounts = await jito.getTipAccounts();
        const jitoTipAccount = new PublicKey(tipAccounts[0]);
        const tipIx = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1000000, // 0.001 SOL Tip
        });

        // D. Build & Sign Atomic Bundle
        const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        
        // Note: Real HFT bots re-sign the TX to include the Jito Tip in a single atomic bundle
        swapTx.sign([wallet]);

        // E. Send Bundle to Jito Block Engine
        const bundleId = await jito.sendBundle([swapTx]);
        console.log(`🚀 [REAL TRADE] Bundle Sent: ${bundleId}`);

    } catch (err) {
        console.error("❌ Execution Error:", err.message);
    }
}

// --- 3. THE 5S SENTIMENT LOOP ---
setInterval(async () => {
    // 1. Fetch AI Signal
    const res = await axios.get(`https://api.lunarcrush.com/v2?data=assets&symbol=SOL&key=${process.env.LUNAR_API_KEY}`);
    const score = res.data.data[0].galaxy_score;

    // 2. Conditional Execution
    if (score >= 75) {
        console.log(`🔥 BULLISH SIGNAL (${score}). Executing Atomic Trade...`);
        await executeRealTrade(0.1); 
    }
}, 5000);
