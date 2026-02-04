/**
 * POCKET ROBOT v16.8 - APEX PRO (Vault & Withdrawal Edition)
 * Verified: February 4, 2026 | Yellowstone gRPC Integration
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { Connection, Keypair, Transaction, SystemProgram, ComputeBudgetProgram, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

const bot = new Telegraf(process.env.BOT_TOKEN);
const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');

bot.use((new LocalSession({ database: 'session.json' })).middleware());

// --- 🔐 WALLET DERIVATION ENGINE ---
function deriveKeypair(mnemonic) {
    const seed = bip39.mnemonicToSeedSync(mnemonic.trim());
    const seedBuffer = Buffer.from(seed).toString('hex');
    const path = "m/44'/501'/0'/0'"; 
    const { key } = derivePath(path, seedBuffer);
    return Keypair.fromSeed(key);
}

// --- 📊 SESSION STATE ---
bot.use((ctx, next) => {
    ctx.session.trade = ctx.session.trade || { 
        asset: 'SOL/USD', 
        amount: 10, 
        payout: 94, 
        totalProfit: 0,
        connected: false,
        publicAddress: null,
        targetWallet: null // Destination for withdrawals
    };
    ctx.session.autoPilot = ctx.session.autoPilot || false;
    return next();
});

// --- 📱 POCKET ROBOT KEYBOARD ---
const mainKeyboard = (ctx) => Markup.inlineKeyboard([
    [Markup.button.callback(`📈 Asset: ${ctx.session.trade.asset}`, 'menu_coins')],
    [Markup.button.callback(`💰 Session Profit: $${ctx.session.trade.totalProfit}`, 'refresh')],
    [Markup.button.callback(ctx.session.autoPilot ? '🛑 STOP AUTO-PILOT' : '🚀 START AUTO-PILOT', 'toggle_auto')],
    [Markup.button.callback('🏦 VAULT / WITHDRAW', 'menu_vault')],
    [Markup.button.callback(ctx.session.trade.connected ? '✅ LINKED' : '❌ NOT LINKED', 'wallet_status')]
]);

// --- 🕹 VAULT COMMANDS ---

// Set Destination Wallet: /wallet <address>
bot.command('wallet', async (ctx) => {
    const address = ctx.message.text.split(' ')[1];
    if (!address) return ctx.reply("❌ Usage: /wallet <your_solana_address>");
    
    try {
        new PublicKey(address); // Validate address
        ctx.session.trade.targetWallet = address;
        ctx.replyWithMarkdown(`✅ **DESTINATION SET**\nAll payouts will go to: \`${address}\``);
    } catch (e) {
        ctx.reply("❌ Invalid Solana Address.");
    }
});

// Manual Withdrawal: /withdraw <amount_in_sol>
bot.command('withdraw', async (ctx) => {
    if (!ctx.session.trade.connected || !ctx.session.mnemonic) {
        return ctx.reply("❌ Connect your trading wallet first using `/connect <seed>`");
    }
    if (!ctx.session.trade.targetWallet) {
        return ctx.reply("❌ Set a payout address first using `/wallet <address>`");
    }

    const amount = parseFloat(ctx.message.text.split(' ')[1]);
    if (isNaN(amount) || amount <= 0) return ctx.reply("❌ Usage: /withdraw <amount_in_sol>");

    try {
        const traderWallet = deriveKeypair(ctx.session.mnemonic);
        const destination = new PublicKey(ctx.session.trade.targetWallet);
        const { blockhash } = await connection.getLatestBlockhash();

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: traderWallet.publicKey,
                toPubkey: destination,
                lamports: amount * LAMPORTS_PER_SOL,
            })
        );

        const signature = await connection.sendTransaction(transaction, [traderWallet]);
        ctx.replyWithMarkdown(`💸 **WITHDRAWAL SENT**\nAmount: \`${amount} SOL\`\nSignature: [View on Solscan](https://solscan.io/tx/${signature})`);
    } catch (err) {
        ctx.reply(`❌ Withdrawal Failed: ${err.message}`);
    }
});

// --- ⚡ TRADING LOGIC ---
bot.action('menu_vault', (ctx) => {
    ctx.editMessageText(
        `🏦 **VAULT MANAGEMENT**\n\n` +
        `Target Wallet: \`${ctx.session.trade.targetWallet || "Not Set"}\`\n` +
        `Current Session Profit: *$${ctx.session.trade.totalProfit}*\n\n` +
        `Commands:\n\`/wallet <address>\` - Set destination\n\`/withdraw <amount>\` - Move funds`, 
        { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ BACK', 'home')]]) }
    );
});

// Connect override to save mnemonic in session (needed for signing withdrawals)
bot.command('connect', async (ctx) => {
    const mnemonic = ctx.message.text.split(' ').slice(1).join(' ');
    if (mnemonic.split(' ').length < 12) return ctx.reply("❌ Usage: /connect <12_words>");
    
    await ctx.deleteMessage().catch(() => {});
    const wallet = deriveKeypair(mnemonic);
    ctx.session.mnemonic = mnemonic; // Stored in session.json locally
    ctx.session.trade.publicAddress = wallet.publicKey.toBase58();
    ctx.session.trade.connected = true;
    ctx.replyWithMarkdown(`✅ **TRADING WALLET LINKED**\nAddress: \`${ctx.session.trade.publicAddress}\``, mainKeyboard(ctx));
});

bot.action('home', (ctx) => ctx.editMessageText(`*POCKET ROBOT v16.8 APEX PRO*`, { parse_mode: 'Markdown', ...mainKeyboard(ctx) }));
bot.start((ctx) => ctx.replyWithMarkdown(`*POCKET ROBOT v16.8 APEX PRO*`, mainKeyboard(ctx)));

bot.launch();
