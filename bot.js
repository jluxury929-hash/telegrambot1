// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge'); // This will now have the .get() function
const { startEngine } = require('./launcher');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    console.log(`[LOG]: ${msg}`);
    await bot.sendMessage(adminId, `🔔 **LOG:** ${msg}`, { parse_mode: 'Markdown' }).catch(() => {});
}

const getMenu = () => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: "🌐 1. LAUNCH BROWSER", callback_data: "launch" }],
            [{ text: "📈 CALL (UP)", callback_data: "up" }, { text: "📉 PUT (DOWN)", callback_data: "down" }]
        ]
    }
});

bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V6**\nStatus: `Awaiting Browser...`", getMenu());
});

bot.on('callback_query', async (q) => {
    if (q.data === "launch") {
        await log("⚙️ Opening Browser... Log in manually.");
        try {
            const page = await startEngine();
            await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
            await log("✅ **BRIDGE SECURED.** Bot is ready.");
        } catch (e) { await log(`❌ Error: ${e.message}`); }
    }

    if (q.data === "up" || q.data === "down") {
        try {
            const { page, cursor } = bridge.get(); // THIS WILL NOW WORK
            const action = q.data === "up" ? "call" : "put";
            await log(`Moving mouse to **${action}**...`);
            await cursor.move(action === 'call' ? '.btn-call' : '.btn-put');
            const res = await page.evaluate((a) => window.humanClick(a), action);
            if (res === "OK") await log("✅ Trade Executed!");
        } catch (e) { await log(`❌ ${e.message}`); }
    }
    bot.answerCallbackQuery(q.id);
});

log("🤖 Bot Online. Type /start in Telegram.");
