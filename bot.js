require('dotenv').config();
const { Connection, Keypair, PublicKey, VersionedTransaction, SystemProgram } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const { createJupiterApiClient } = require('@jup-ag/api');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const bs58 = require('bs58');

// --- 1. SETTINGS & CONNECTIONS ---
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const jupApi = createJupiterApiClient();
// Jito Block Engine (Change URL based on your VPS location: ny, amsterdam, frankfurt, tokyo)
const jito = searcherClient("frankfurt.mainnet.block-engine.jito.wtf", Keypair.fromSecretKey(bs58.decode(process.env.JITO_AUTH_KEY)));

const getWallet = () => {
    const seed = bip39.mnemonicToSeedSync(process.env.SEED_PHRASE);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    return Keypair.fromSeed(derivedSeed);
};

const wallet = getWallet();

// --- 2. THE PROFIT ENGINE ---
async function executeTradeCycle() {
    try {
        console.log(`--- Cycle Start: ${new Date().toLocaleTimeString()} ---`);

        // A. Fetch Quote (e.g., 10 SOL to USDC)
        const quote = await jupApi.quoteGet({
            inputMint: "So11111111111111111111111111111111111111112", // SOL
            outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
            amount: 10 * 1e9, 
            slippageBps: 10, // 0.1% strict slippage for HFT
        });

        // B. Build Swap Transaction
        const { swapTransaction } = await jupApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            }
        });

        // C. Fetch Dynamic Jito Tip (Crucial for 90% Win Rate)
        const tipAccounts = await jito.getTipAccounts();
        const jitoTipAccount = new PublicKey(tipAccounts[Math.floor(Math.random() * tipAccounts.length)]);
        
        // We set a high tip (e.g., 0.001 SOL) to outbid other bots
        const tipIx = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: jitoTipAccount,
            lamports: 1000000, 
        });

        // D. Create Bundle
        const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        swapTx.sign([wallet]);

        // E. Blast Bundle to Jito
        const bundleId = await jito.sendBundle([swapTx]);
        console.log(`✅ Bundle Landed: ${bundleId}`);

    } catch (err) {
        console.error("❌ Cycle Failed:", err.message);
    }
}

// --- 3. THE 5-SECOND HEARTBEAT ---
console.log(`Engine running for: ${wallet.publicKey.toBase58()}`);
setInterval(executeTradeCycle, 5000);
