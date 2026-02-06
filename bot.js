// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

// --- 🛰️ LIVE TELEGRAM LOGGER ---
async function log(msg) {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] ${msg}`);
    try {
        await bot.sendMessage(adminId, `🔔 **LOG:** \`[${now}]\`\n> ${msg}`, { parse_mode: 'Markdown' });
    } catch (e) { console.error("Log failed"); }
}

// --- 🎯 THE UNBREAKABLE TRADE ENGINE ---
async function executeTrade(direction) {
    try {
        const { page, cursor } = await bridge.getSafe();
        const action = direction === "UP" ? "call" : "put";
        const selector = action === 'call' ? '.btn-call' : '.btn-put';

        await log(`Bridge verified. Moving mouse for **${direction}**...`);

        // Human Jitter (Reaction Time)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1500));
        
        // Physics-based Mouse Movement
        await cursor.move(selector);
        
        // Trigger UI Click
        const status = await page.evaluate((a) => window.humanClick(a), action);
        
        if (status === "OK") {
            await log(`✅ **TRADE SUCCESS.** Order placed on server.`);
        } else {
            await log(`⚠️ **UI ERROR.** Button not visible. Make sure chart is open.`);
        }

    } catch (e) {
        await log(`❌ **BRIDGE ERROR:** ${e.message}`);
    }
}

// --- 📱 TELEGRAM INTERFACE ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V5.1**", {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📈 CALL (UP)", callback_data: "up" }, { text: "📉 PUT (DOWN)", callback_data: "down" }]
            ]
        }
    });
});

bot.on('callback_query', (q) => {
    if (q.data === "up") executeTrade("UP");
    if (q.data === "down") executeTrade("DOWN");
    bot.answerCallbackQuery(q.id);
});

log("🤖 Bot Intelligence Online.");
