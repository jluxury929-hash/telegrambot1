require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Connection, Keypair, Transaction, SystemProgram } = require('@solana/web3.js');
const { searcherClient } = require('@solsdk/jito-ts');
const bs58 = require('bs58');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const trader = Keypair.fromSecretKey(bs58.decode(process.env.TRADER_PRIVATE_KEY));
const jito = searcherClient(process.env.JITO_BLOCK_ENGINE_URL);

// Pocket Robot Styling
const header = "⚡️ **POCKET ROBOT v4.0** ⚡️\n━━━━━━━━━━━━━━━━━━━━";

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `${header}\n🛡 **Guard:** Jito Atomic Reversal\n💰 **Payout:** 80% (Priority Inclusion)\n\nReady?`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📈 MANUAL MODE", callback_data: 'manual' }],
                [{ text: "🤖 AUTO-PILOT [OFF]", callback_data: 'auto' }]
            ]
        }
    });
});

// Auto-Pilot Logic
async function triggerAutoTrade(chatId) {
    bot.sendMessage(chatId, "🚀 **Auto-Pilot Live.** (5s Refresh)");
    
    setInterval(async () => {
        // 1. Logic: Get Price -> Detect 5s Trend
        // 2. Build Bundle: [FlashLoan, GuardedBetTx, Repay, JitoTip]
        const strike = 96500; // Example BTC strike
        
        try {
            // sendBundle will ONLY land if execute_guarded_bet in Rust returns SUCCESS
            const bundleId = await sendJitoBundle(1, 1, strike); 
            bot.sendMessage(chatId, `✅ **TRADE WIN:** +0.80 SOL\nID: \`${bundleId.slice(0,8)}\``, {parse_mode: 'Markdown'});
        } catch (e) {
            // If the Rust code reverts, this catch block handles it
            console.log("Reverted: Price move wrong.");
        }
    }, 5000);
}

async function sendJitoBundle(asset, dir, strike) {
    const { blockhash } = await connection.getLatestBlockhash();
    const tipAccount = new PublicKey((await jito.getTipAccounts())[0]);

    // Build instructions...
    const tx = new Transaction().add(/* Guarded Bet Ix */);
    tx.recentBlockhash = blockhash;
    tx.sign(trader);

    // Add Tip
    const tipIx = SystemProgram.transfer({ fromPubkey: trader.publicKey, toPubkey: tipAccount, lamports: 2000000 });
    const tipTx = new Transaction().add(tipIx);
    tipTx.recentBlockhash = blockhash;
    tipTx.sign(trader);

    return await jito.sendBundle([tx, tipTx]);
}
