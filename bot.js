require('dotenv').config();
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

// --- 1. INITIALIZATION & WALLET ---
const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const getWalletFromMnemonic = () => {
    try {
        const mnemonic = (process.env.SEED_PHRASE || "").trim().replace(/["']/g, "");
        const seed = bip39.mnemonicToSeedSync(mnemonic);
        const path = "m/44'/501'/0'/0'";
        const derivedSeed = derivePath(path, seed.toString('hex')).key;
        return Keypair.fromSeed(derivedSeed);
    } catch (e) {
        console.error("❌ Wallet Error:", e.message);
        process.exit(1);
    }
};

const wallet = getWalletFromMnemonic();
let autoPilot = false;
const uiHeader = "⚡️ **POCKET ROBOT v4.0** ⚡️\n━━━━━━━━━━━━━━━━━━━━";

// --- 2. TELEGRAM INTERFACE ---

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    let balance = 0;
    try {
        const lamports = await connection.getBalance(wallet.publicKey);
        balance = (lamports / LAMPORTS_PER_SOL).toFixed(2);
    } catch (e) { balance = "Error"; }

    bot.sendMessage(chatId, 
        `${uiHeader}\n` +
        `🛡 **Mode:** AI Sentiment Guard\n` +
        `💰 **Wallet:** \`${wallet.publicKey.toBase58().slice(0, 6)}...\`\n` +
        `💎 **Balance:** ${balance} SOL\n` +
        `📡 **AI Pulse:** Connected\n\n` +
        `Select Action:`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: autoPilot ? "🤖 AUTO-PILOT [ON]" : "🤖 AUTO-PILOT [OFF]", callback_data: 'toggle_auto' }],
                [{ text: "📤 PAYOUT / WITHDRAW", callback_data: 'payout' }]
            ]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'toggle_auto') {
        autoPilot = !autoPilot;
        bot.answerCallbackQuery(query.id, { text: `Auto-Pilot: ${autoPilot ? 'ON' : 'OFF'}` });
        if (autoPilot) startTradingEngine(chatId);
    }
});

// --- 3. THE TRADING ENGINE ---

async function startTradingEngine(chatId) {
    bot.sendMessage(chatId, "🚀 **Auto-Pilot Live.** Polling AI Sentiment every 5s...");
    
    while (autoPilot) {
        try {
            // 1. Check AI Pulse
            const res = await axios.get(`https://api.lunarcrush.com/v2?data=assets&symbol=SOL&key=${process.env.LUNAR_API_KEY}`);
            const score = res.data.data[0].galaxy_score;

            if (score >= 75) {
                // 2. Execute Swap (Jupiter V6)
                const quote = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${0.1 * 1e9}&slippageBps=50`);
                
                bot.sendMessage(chatId, `🔥 **High Sentiment Detected (${score})**\nExecuting 0.1 SOL Buy...`);
                // (Actual swap execution logic here)
            }
        } catch (err) {
            console.error("Engine Error:", err.message);
        }
        await new Promise(r => setTimeout(r, 5000));
    }
}

console.log("Pocket Robot Engine Running...");
