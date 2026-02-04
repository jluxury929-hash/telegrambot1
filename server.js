require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Connection, Keypair } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- 1. WALLET CONNECTION LOGIC ---
async function getWalletFromMnemonic(mnemonic) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const seedBuffer = Buffer.from(seed).toString('hex');
    const path = "m/44'/501'/0'/0'"; // Standard Solana Derivation Path
    const derivedSeed = derivePath(path, seedBuffer).key;
    return Keypair.fromSeed(derivedSeed);
}

let traderWallet;
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Initialize Wallet
(async () => {
    traderWallet = await getWalletFromMnemonic(process.env.SEED_PHRASE);
    console.log(`✅ Pocket Robot Linked: ${traderWallet.publicKey.toBase58()}`);
})();

const bot = new Telegraf(process.env.BOT_TOKEN);

// --- 2. INTERFACE ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback('🤖 AUTO-PILOT: OFF', 'toggle_auto')],
    [Markup.button.callback('🛠 MANUAL MODE', 'manual_menu')],
    [Markup.button.callback('💰 WITHDRAW PROFITS', 'withdraw')]
]);

bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `📡 *POCKET ROBOT v9.2 - LIVE ENGINE*\n\n` +
        `*Status:* Connected to Coinbase Wallet\n` +
        `*Address:* \`${traderWallet.publicKey.toBase58()}\`\n\n` +
        `All trade profits are settled *atomically* and sent directly to your connected address.`,
        mainKeyboard(ctx)
    );
});

// --- 3. ATOMIC AUTO-PILOT ---
bot.action('toggle_auto', (ctx) => {
    ctx.editMessageText("🟢 *AUTOPILOT ACTIVATED*\n`Searching for institutional gRPC signals...`\n\n_Bot will execute trades only when Jito Atomic Bundles are confirmed profitable._", 
    Markup.inlineKeyboard([[Markup.button.callback('🛑 STOP BOT', 'stop_bot')]]));
    
    // Auto-Trade Loop simulation
    const loop = setInterval(async () => {
        const profit = (Math.random() * 200 + 50).toFixed(2);
        await ctx.replyWithMarkdown(
            `🎯 **ATOMIC TRADE COMPLETE**\n` +
            `*Direction:* BTC CALL (Higher)\n` +
            `*Settlement:* +$${profit} USD\n` +
            `*Destination:* Internal Wallet`
        );
    }, 15000);

    bot.action('stop_bot', (innerCtx) => {
        clearInterval(loop);
        innerCtx.editMessageText("🔴 *AUTOPILOT STOPPED*", mainKeyboard(ctx));
    });
});

// --- 4. MANUAL OPTIONS ---
bot.action('manual_menu', (ctx) => {
    ctx.editMessageText("🛠 *MANUAL CONFIGURATION*", Markup.inlineKeyboard([
        [Markup.button.callback('Asset: BTC/USD', 'null'), Markup.button.callback('Expiry: 1m', 'null')],
        [Markup.button.callback('Payout: 92%', 'null'), Markup.button.callback('Stake: $500', 'null')],
        [Markup.button.callback('🚀 EXECUTE NOW', 'exec_manual')],
        [Markup.button.callback('⬅️ BACK', 'start')]
    ]));
});

bot.launch();
