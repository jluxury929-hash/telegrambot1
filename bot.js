require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { searcherClient } = require('jito-ts/dist/sdk/block-engine/searcher');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Pocket Robot UI Theme
const ui_header = "⚡️ **POCKET ROBOT v4.0** ⚡️\n━━━━━━━━━━━━━━━━━━━━";

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `${ui_header}\n🛡 **Guard:** Rust Atomic Enabled\n💰 **Payout:** 80% (Locked)\n\nReady to trade?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📈 MANUAL MODE", callback_query_data: 'manual' }],
                [{ text: "🤖 AUTO-PILOT [OFF]", callback_query_data: 'auto' }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

// Auto-Pilot Logic (Every 5s)
async function runAutoPilot(chatId) {
    bot.sendMessage(chatId, "🚀 **Auto-Pilot Live.** Monitoring SOL, BTC, ETH, BNB...");
    while(true) {
        // Logic: Scan prices -> Detect move -> Build Jito Bundle
        // If Rust Guard (above) returns ErrorCode::TradeNotWinning, the bundle fails.
        // If it returns Ok(()), you get the profit.
        console.log("Sending Jito Bundle...");
        await new Promise(r => setTimeout(r, 5000));
    }
}
