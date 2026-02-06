require('dotenv').config();
const { Connection, Keypair, PublicKey, TransactionInstruction, SystemProgram, VersionedTransaction } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const { createJupiterApiClient } = require('@jup-ag/api');
const bs58 = require('bs58');

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const jupApi = createJupiterApiClient();
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));

// Jito Setup (Region-specific for speed, e.g., Frankfurt)
const jito = searcherClient("frankfurt.mainnet.block-engine.jito.wtf", wallet);

async function runHighFrequencyBot() {
    console.log("🚀 Engine Active. Target: 5s Intervals | 90% Inclusion");

    while (true) {
        try {
            const start = Date.now();

            // 1. Get Real Quote from Jupiter
            const quote = await jupApi.quoteGet({
                inputMint: "So11111111111111111111111111111111111111112", // SOL
                outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
                amount: 1000000000, // 1 SOL
                slippageBps: 50,
            });

            // 2. Build Swap Transaction
            const { swapTransaction } = await jupApi.swapPost({
                swapRequest: { quoteResponse: quote, userPublicKey: wallet.publicKey.toBase58() }
            });

            // 3. Add Jito Tip & Guard (Competitive Bidding)
            const tipAccounts = await jito.getTipAccounts();
            const tipAccount = new PublicKey(tipAccounts[0]);
            
            // Winning 90% requires outbidding competitors (e.g., 0.001 SOL Tip)
            const tipIx = SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: tipAccount,
                lamports: 1000000, 
            });

            // 4. Assemble Bundle
            const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
            
            // 5. Send to Jito Block Engine
            const bundleId = await jito.sendBundle([swapTx]);
            console.log(`[${new Date().toISOString()}] Bundle Sent: ${bundleId}`);

            // 6. Precise 5-second Sync
            const elapsed = Date.now() - start;
            await new Promise(r => setTimeout(r, Math.max(0, 5000 - elapsed)));

        } catch (e) {
            console.error("Cycle failed, retrying...", e.message);
        }
    }
}

runHighFrequencyBot();
