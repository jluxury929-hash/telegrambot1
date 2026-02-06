// bot.js
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge'); // Pull from the same bridge file

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

// --- 🛰️ LOGGING FUNCTION ---
async function logToTelegram(msg) {
    console.log(`[LOG]: ${msg}`);
    await bot.sendMessage(adminId, `🔔 **LOG:** ${msg}`, { parse_mode: 'Markdown' });
}

// --- 🎯 THE FIX: STABLE EXECUTION ---
async function trade(direction) {
    try {
        const { page, cursor } = bridge.get(); // ALWAYS works now
        const action = direction === "UP" ? "call" : "put";

        await logToTelegram(`Scanning chart for **${direction}**...`);
        
        // Human Jitter
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

        await logToTelegram(`Moving mouse to button...`);
        await cursor.move(action === 'call' ? '.btn-call' : '.btn-put');

        const status = await page.evaluate((a) => window.humanClick(a), action);
        
        if (status === "OK") {
            await logToTelegram(`✅ **SUCCESS:** Bet placed on Pocket Option!`);
        } else {
            await logToTelegram(`❌ **ERROR:** UI Buttons not found.`);
        }
    } catch (e) {
        await logToTelegram(`⚠️ **CRITICAL:** ${e.message}`);
    }
}

// --- TELEGRAM COMMANDS ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V5**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📈 CALL (UP)", callback_data: "up" }, { text: "📉 PUT (DOWN)", callback_data: "down" }]
            ]
        }
    });
});

bot.on('callback_query', (q) => {
    if (q.data === "up") trade("UP");
    if (q.data === "down") trade("DOWN");
    bot.answerCallbackQuery(q.id);
});
