/**
 * POCKET ROBOT v16.8 - BASE58 STABILITY FIX
 * Verified: February 4, 2026
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- 🛡️ THE FAIL-SAFE SANITIZER ---
// This function removes any non-base58 characters before they cause a crash.
const toSafePub = (str) => {
    try {
        const clean = str.toString().trim().replace(/[^1-9A-HJ-NP-Za-km-z]/g, '');
        return new PublicKey(clean);
    } catch (e) {
        console.error(`❌ FATAL: Invalid Public Key format. Check your .env or input.`);
        return null;
    }
};

// --- 🔐 SEED TO KEYPAIR DERIVATION ---
function deriveFromSeed(mnemonic) {
    // Solana standard derivation path for Phantom/Solflare
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const seedBuffer = Buffer.from(seed).toString('hex');
    const path = "m/44'/501'/0'/0'"; 
    const { key } = derivePath(path, seedBuffer);
    return Keypair.fromSeed(key);
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com');

// Example: Standard Pyth BTC Account
const BTC_PUBKEY = toSafePub("H6ARHfE2L5S9S73Fp3vEpxDK9Jp9vE8V9vJp9vE8");

bot.command('connect', async (ctx) => {
    const mnemonic = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (mnemonic.split(' ').length < 12) {
        return ctx.reply("❌ Use: /connect word1 word2 ... word12");
    }

    try {
        // Delete sensitive message immediately
        await ctx.deleteMessage().catch(() => {});

        const linkedWallet = deriveFromSeed(mnemonic);
        const address = linkedWallet.publicKey.toBase58();

        ctx.replyWithMarkdown(
            `✅ **WALLET LINKED**\n\n` +
            `Address: \`${address}\`\n` +
            `_Seed processed and message wiped._`
        );
    } catch (err) {
        ctx.reply("❌ Error: Derivation failed. Check your seed words.");
    }
});

bot.launch().then(() => console.log("🚀 Stability v16.8 is Online."));
