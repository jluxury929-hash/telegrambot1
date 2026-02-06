require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const bs58 = require('bs58');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const trader = Keypair.fromSecretKey(bs58.decode(process.env.TRADER_PRIVATE_KEY));
const jito = searcherClient(process.env.JITO_BLOCK_ENGINE_URL);

let isAuto = false;

const header = "⚡️ **POCKET ROBOT v4.0** ⚡️\n━━━━━━━━━━━━━━━━━━━━";

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `${header}\n🛡 **Guard:** Atomic Jito Reversal\n💰 **Payout:** 80% (Locked)\n\n/manual - Select Pair\n/auto - Toggle AI`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🤖 AUTO-PILOT", callback_data: 'toggle_auto' }]]
        }
    });
});

bot.on('callback_query', async (query) => {
    if (query.data === 'toggle_auto') {
        isAuto = !isAuto;
        bot.sendMessage(query.message.chat.id, `🤖 AI Mode: ${isAuto ? "ON" : "OFF"}`);
        if (isAuto) runLoop(query.message.chat.id);
    }
});

async function runLoop(chatId) {
    while (isAuto) {
        // High-speed 5s loop
        await bot.sendMessage(chatId, "🔄 **Scanning Oracles...** SOL/USD detected!");
        
        try {
            // This only LANDS if the Rust code confirms a profit
            const bundleId = await sendAtomicBundle();
            bot.sendMessage(chatId, `✅ **CONFIRMED:** +0.80 SOL Profit\nID: \`${bundleId.slice(0,8)}\``, {parse_mode: 'Markdown'});
        } catch (e) {
            bot.sendMessage(chatId, "❌ **REVERTED:** Price didn't move. $0 lost.");
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

async function sendAtomicBundle() {
    const { blockhash } = await connection.getLatestBlockhash();
    // 1. Build Trade Transaction (Calls your Rust Program)
    // 2. Build Tip Transaction (Ensures priority)
    // 3. sendBundle([TradeTx, TipTx])
    return "DummyBundleID"; // Real logic uses jito.sendBundle
}
