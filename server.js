/**
 * ===============================================================================
 * APEX PREDATOR: NEURAL ULTRA v9057 (MANUAL OVERRIDE EDITION)
 * ===============================================================================
 * ADDED: /amount <value> command (e.g., /amount 0.25) to override trade size.
 * FIX: Symbol & PnL mapping for DexScreener v1 Boosts.
 * FIX: On-chain Transaction Confirmation & Price Refresh.
 * SPEED: Jito-Bundle Tipping & 150k CU Priority.
 * ===============================================================================
 */

// ... [Existing Requires: Connection, Keypair, LAMPORTS_PER_SOL, axios, TelegramBot, etc.]

// --- 1. GLOBAL STATE ---
let SYSTEM = {
    autoPilot: false, tradeAmount: "0.1", risk: 'MEDIUM', mode: 'SHORT',
    lastTradedTokens: {}, isLocked: false, 
    currentAsset: 'So11111111111111111111111111111111111111112', // SOL
    entryPrice: 0, currentPnL: 0, currentSymbol: 'SOL'
};

// ... [toExact helper and getDashboardMarkup logic from v9056]

// ==========================================
//  NEW: MANUAL OVERRIDE COMMANDS
// ==========================================

/**
 * Command: /amount <decimal>
 * Example: /amount 0.5
 * Captures any number (integer or decimal) and updates the trading size.
 */
bot.onText(/\/amount (\d*\.?\d+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const newAmount = match[1]; // Extracts the number from the command

    if (parseFloat(newAmount) <= 0) {
        return bot.sendMessage(chatId, "❌ <b>ERROR:</b> Amount must be greater than 0.", { parse_mode: 'HTML' });
    }

    SYSTEM.tradeAmount = newAmount;
    
    bot.sendMessage(chatId, 
        `✅ <b>MANUAL OVERRIDE:</b>\n` +
        `Trade Size updated to: <code>${newAmount} SOL</code>\n` +
        `<i>Next rotation will use this value.</i>`, 
        { parse_mode: 'HTML' }
    );
    
    console.log(`[USER OVERRIDE] Trade size changed to ${newAmount} SOL`.magenta);
});

// ==========================================
//  PnL & ROTATION ENGINE (v9056 SYNC)
// ==========================================

async function executeRotation(chatId, targetToken, symbol) {
    try {
        const conn = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com', 'confirmed');
        // USES THE UPDATED SYSTEM.tradeAmount
        const amt = Math.floor(parseFloat(SYSTEM.tradeAmount) * LAMPORTS_PER_SOL);

        const quote = await axios.get(`https://api.jup.ag/ultra/v1/quote?inputMint=${SYSTEM.currentAsset}&outputMint=${targetToken}&amount=${amt}&slippageBps=150`);
        
        const { swapTransaction } = (await axios.post(`https://api.jup.ag/ultra/v1/swap`, {
            quoteResponse: quote.data,
            userPublicKey: solWallet.publicKey.toString(),
            prioritizationFeeLamports: 150000 
        })).data;

        const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
        tx.sign([solWallet]);

        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        
        bot.sendMessage(chatId, `⏳ <b>Confirming Rotation (${SYSTEM.tradeAmount} SOL)...</b>`, { parse_mode: 'HTML' });

        const result = await conn.confirmTransaction(sig, 'confirmed');

        if (!result.value.err) {
            const pRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${targetToken}`);
            SYSTEM.entryPrice = parseFloat(pRes.data.pairs[0].priceUsd);
            SYSTEM.currentAsset = targetToken;
            SYSTEM.currentSymbol = symbol;
            SYSTEM.currentPnL = 0;
            bot.sendMessage(chatId, `✅ <b>SUCCESS:</b> Now holding $${symbol}\n<a href="https://solscan.io/tx/${sig}">Solscan Link</a>`, { parse_mode: 'HTML', disable_web_page_preview: true });
        }
    } catch (e) { 
        bot.sendMessage(chatId, "⚠️ <b>Swap Failed:</b> Check balance or RPC connection."); 
    }
}

// ... [Rest of updateLivePnL, Dashboard, and Wallet Connect logic]

http.createServer((req, res) => res.end("APEX v9057 READY")).listen(8080);
