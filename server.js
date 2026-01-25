/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9063 (MASTER SYNC BUILD)
 * ===============================================================================
 * FIX: /connect (Standard m/44'/501'/0'/0' + Legacy m/44'/501'/0' detection).
 * FIX: Button UI (Forced state refresh + answerCallbackQuery acknowledgment).
 * FIX: Aggressive Rebroadcast (v9061 engine) for landing swaps in 2026.
 * ADD: /amount <val> (Regex-based manual override).
 * ===============================================================================
 */

require('dotenv').config();
const { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
require('colors');

// --- 1. CORE INITIALIZATION ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// --- 2. GLOBAL STATE ---
const JUP_ULTRA_API = "https://api.jup.ag/v6"; // Updated to V6 for 2026
const SCAN_HEADERS = { headers: { 'User-Agent': 'Mozilla/5.0' }};

let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: false, 
    currentAsset: 'So11111111111111111111111111111111111111112', // SOL
    entryPrice: 0, currentPnL: 0, currentSymbol: 'SOL'
};
let solWallet;

const toExact = (num, fixed) => {
    const re = new RegExp('^-?\\d+(?:\\.\\d{0,' + (fixed || -1) + '})?');
    const match = num.toString().match(re);
    return match ? match[0] : num.toString();
};

// --- 3. UI DASHBOARD (REBUILT FOR STABILITY) ---
const getDashboardMarkup = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: SYSTEM.autoPilot ? "🛑 STOP AUTO-PILOT" : "🚀 START AUTO-PILOT", callback_data: "cmd_auto" }],
            [{ text: `💰 AMT: ${SYSTEM.tradeAmount} SOL`, callback_data: "cycle_amt" }, { text: "📊 STATUS", callback_data: "cmd_status" }],
            [{ text: `🛡️ RISK: ${SYSTEM.risk}`, callback_data: "cycle_risk" }, { text: `⏱️ MODE: ${SYSTEM.mode}`, callback_data: "cycle_mode" }],
            [{ text: "🔗 SYNC WALLET", callback_data: "cmd_conn" }]
        ]
    }
});

// --- 4. THE /connect FIX (MULTI-PATH DETECTION) ---
bot.onText(/\/connect (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const mnemonic = match[1].trim();

    try {
        if (!bip39.validateMnemonic(mnemonic)) throw new Error("Invalid Seed Phrase");
        
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const hex = seed.toString('hex');
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');

        // Path A: Standard (m/44'/501'/0'/0') 
        const keyA = Keypair.fromSeed(derivePath("m/44'/501'/0'/0'", hex).key);
        // Path B: Legacy (m/44'/501'/0')
        const keyB = Keypair.fromSeed(derivePath("m/44'/501'/0'", hex).key);

        const [balA, balB] = await Promise.all([conn.getBalance(keyA.publicKey), conn.getBalance(keyB.publicKey)]);
        
        // Select the path with the balance
        solWallet = (balB > balA) ? keyB : keyA;

        bot.sendMessage(chatId, 
            `🔗 <b>WALLET SYNCED SUCCESSFULLY</b>\n` +
            `📍 <b>ADDR:</b> <code>${solWallet.publicKey.toString()}</code>\n` +
            `💰 <b>BAL:</b> <code>${(Math.max(balA, balB)/1e9).toFixed(4)} SOL</code>\n\n` +
            `<i>Use /menu to start.</i>`, { parse_mode: 'HTML' });
    } catch (e) {
        bot.sendMessage(chatId, `❌ <b>SYNC FAILED:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
});

// --- 5. BUTTON & MENU LOGIC (FIXED UI) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;

    // MANDATORY: Stop the loading spinner immediately
    await bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        if (query.data === "cycle_risk") {
            const risks = ['LOW', 'MEDIUM', 'HIGH'];
            SYSTEM.risk = risks[(risks.indexOf(SYSTEM.risk) + 1) % risks.length];
        } else if (query.data === "cycle_mode") {
            const modes = ['SHORT', 'MEDIUM', 'LONG'];
            SYSTEM.mode = modes[(modes.indexOf(SYSTEM.mode) + 1) % modes.length];
        } else if (query.data === "cycle_amt") {
            const amts = ["0.05", "0.1", "0.25", "0.5"];
            SYSTEM.tradeAmount = amts[(amts.indexOf(SYSTEM.tradeAmount) + 1) % amts.length];
        } else if (query.data === "cmd_auto") {
            if (!solWallet) return bot.sendMessage(chatId, "⚠️ Sync Wallet first!");
            SYSTEM.autoPilot = !SYSTEM.autoPilot;
            if (SYSTEM.autoPilot) startHeartbeat(chatId);
        } else if (query.data === "cmd_status") {
            return runStatusDashboard(chatId);
        } else if (query.data === "cmd_conn") {
            return bot.sendMessage(chatId, "⌨️ Type: <code>/connect your_12_word_seed</code>", { parse_mode: 'HTML' });
        }

        // FORCE REFRESH: Edit message with new state
        bot.editMessageReplyMarkup(getDashboardMarkup().reply_markup, { chat_id: chatId, message_id: msgId }).catch(() => {});
    } catch (e) { console.error("UI Error:", e.message); }
});

// --- 6. MANUAL OVERRIDE ---
bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    SYSTEM.tradeAmount = match[1];
    bot.sendMessage(msg.chat.id, `✅ <b>SIZE UPDATED:</b> <code>${SYSTEM.tradeAmount} SOL</code>`, { parse_mode: 'HTML' });
});

bot.onText(/\/(start|menu)/, (msg) => {
    bot.sendMessage(msg.chat.id, "<b>⚡️ APEX PREDATOR v9063 ⚡️</b>", { parse_mode: 'HTML', ...getDashboardMarkup() });
});

// --- 7. AGGRESSIVE ROTATION ENGINE (v9061) ---
async function executeAggressiveRotation(chatId, targetToken, symbol) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        const quoteRes = await axios.get(`https://quote-api.jup.ag/v6/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=250`);
        const { swapTransaction } = (await axios.post(`https://quote-api.jup.ag/v6/swap`, {
            quoteResponse: quoteRes.data,
            userPublicKey: solWallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            prioritizationFeeLamports: "auto",
            autoMultiplier: 2
        })).data;

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([solWallet]);
        const rawTx = tx.serialize();

        let confirmed = false;
        let sig = "";
        const startTime = Date.now();

        // Spam broadcast loop
        const interval = setInterval(async () => {
            if (confirmed) return clearInterval(interval);
            try { sig = await conn.sendRawTransaction(rawTx, { skipPreflight: true, maxRetries: 0 }); } catch (e) {}
        }, 2000);

        while (!confirmed && Date.now() - startTime < 60000) {
            const status = await conn.getSignatureStatus(sig);
            if (status?.value?.confirmationStatus === 'confirmed') {
                confirmed = true;
                clearInterval(interval);
                // State Update...
                bot.sendMessage(chatId, `✅ <b>ROTATED TO $${symbol}</b>`, { parse_mode: 'HTML' });
                return;
            }
            await new Promise(r => setTimeout(r, 1500));
        }
    } catch (e) { bot.sendMessage(chatId, "⚠️ Rotation failed."); }
}

async function startHeartbeat(chatId) {
    if (!SYSTEM.autoPilot) return;
    try {
        if (!SYSTEM.isLocked) {
            const res = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', SCAN_HEADERS);
            const match = res.data.find(t => t.chainId === 'solana' && t.tokenAddress && !SYSTEM.lastTradedTokens[t.tokenAddress]);
            if (match) {
                SYSTEM.isLocked = true;
                await executeAggressiveRotation(chatId, match.tokenAddress, match.symbol || "TKN");
                SYSTEM.isLocked = false;
            }
        }
    } catch (e) {}
    setTimeout(() => startHeartbeat(chatId), 3000);
}

http.createServer((req, res) => res.end("v9063 LIVE")).listen(8080);
