require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge');
const { startEngine } = require('./launcher');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    console.log(`[LOG]: ${msg}`);
    await bot.sendMessage(adminId, `🔔 **LOG:** ${msg}`, { parse_mode: 'Markdown' }).catch(() => {});
}

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 1. LAUNCH BROWSER", callback_data: "launch" }],
                [{ text: "📈 CALL", callback_data: "up" }, { text: "📉 PUT", callback_data: "down" }]
            ]
        }
    });
});

bot.on('callback_query', async (q) => {
    if (q.data === "launch") {
        await log("⚙️ Opening Browser...");
        try {
            await startEngine();
            await log("✅ **BRIDGE READY.**");
        } catch (e) { await log(`❌ Error: ${e.message}`); }
    }
    if (q.data === "up" || q.data === "down") {
        try {
            const { page, cursor } = bridge.get();
            const action = q.data === "up" ? "call" : "put";
            await cursor.move(action === 'call' ? '.btn-call' : '.btn-put');
            await page.evaluate((a) => window.humanClick(a), action);
            await log(`✅ Trade placed: ${q.data.toUpperCase()}`);
        } catch (e) { await log(`❌ ${e.message}`); }
    }
    bot.answerCallbackQuery(q.id);
});

console.log("🚀 Bot is live. Waiting for /start...");
