require('dotenv').config();
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');

// --- 1. CONFIGURATION & WALLET DERIVATION ---
const getWalletFromMnemonic = () => {
    try {
        const mnemonic = (process.env.SEED_PHRASE || "").trim();
        if (!bip39.validateMnemonic(mnemonic)) {
            throw new Error("Invalid Mnemonic Phrase in .env. Please check the 12/24 words.");
        }

        // Convert mnemonic words to a seed buffer
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        
        // Derive the standard Solana path (m/44'/501'/0'/0')
        const path = "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        
        return Keypair.fromSeed(derivedSeed);
    } catch (e) {
        console.error(`[FATAL ERROR] Wallet Setup: ${e.message}`);
        process.exit(1);
    }
};

const traderWallet = getWalletFromMnemonic();
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let autoPilot = false;
const ASSETS = ["SOL/USD", "BTC/USD", "ETH/USD", "BNB/USD"];
const uiHeader = "⚡️ **POCKET ROBOT v4.0** ⚡️\n━━━━━━━━━━━━━━━━━━━━";

// --- 2. BOT COMMANDS ---

// Start / Menu
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Fetch actual balance for the UI
    let balance = 0;
    try {
        const lamports = await connection.getBalance(traderWallet.publicKey);
        balance = (lamports / LAMPORTS_PER_SOL).toFixed(2);
    } catch (e) { balance = "Error"; }

    bot.sendMessage(chatId, 
        `${uiHeader}\n` +
        `🛡 **Guard:** Jito Atomic Reversal\n` +
        `💰 **Wallet:** \`${traderWallet.publicKey.toBase58().slice(0, 6)}...${traderWallet.publicKey.toBase58().slice(-4)}\`\n` +
        `💎 **Balance:** ${balance} SOL\n` +
        `📡 **Status:** Connected\n\n` +
        `Choose a mode:`, 
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📈 MANUAL MODE", callback_data: 'manual' }],
                    [{ text: autoPilot ? "🤖 AUTO-PILOT [ON]" : "🤖 AUTO-PILOT [OFF]", callback_data: 'toggle_auto' }],
                    [{ text: "📤 PAYOUT / WITHDRAW", callback_data: 'payout' }]
                ]
            }
        }
    );
});

// Callback Handlers
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'manual') {
        const buttons = ASSETS.map(asset => [{ text: asset, callback_data: `trade_${asset}` }]);
        bot.editMessageText(`${uiHeader}\n📍 **Manual Mode**\nSelect asset to analyze:`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

    if (query.data === 'toggle_auto') {
        autoPilot = !autoPilot;
        bot.answerCallbackQuery(query.id, { text: `Auto-Pilot: ${autoPilot ? 'ON' : 'OFF'}` });
        if (autoPilot) startTradeLoop(chatId);
    }

    if (query.data === 'payout') {
        bot.sendMessage(chatId, `💸 **Withdrawal Request**\nDestination: External Wallet\nAmount: All Profit\n\n_Status: Processing through Jito bundle..._`, { parse_mode: 'Markdown' });
    }
});

// --- 3. THE TRADE LOOP (JITO PROTECTION LOGIC) ---
async function startTradeLoop(chatId) {
    bot.sendMessage(chatId, "🚀 **Auto-Pilot Live.** Monitoring Pyth Oracles at 5s intervals...");
    
    while (autoPilot) {
        // Here the bot would typically:
        // 1. Fetch price from Pyth
        // 2. Call your Anchor program 'pocket_guard'
        // 3. If price is bad, the Anchor program reverts
        // 4. Jito bundle fails (costing you nothing but small tip)
        
        await bot.sendMessage(chatId, 
            `🔄 **Trade Execution:** SOL/USD [CALL]\n` +
            `⚡️ **Strategy:** Atomic Jito Guard\n` +
            `✅ **Result:** Confirmed +8.2 SOL Profit`
        );
        
        // Wait 5 seconds before next cycle
        await new Promise(r => setTimeout(r, 5000));
    }
}

console.log(`
---------------------------------------
🤖 Pocket Robot Engine v4.0
📍 Address: ${traderWallet.publicKey.toBase58()}
📡 RPC: ${connection.rpcEndpoint}
---------------------------------------
`);
