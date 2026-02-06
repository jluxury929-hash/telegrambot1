// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge'); // Imports the SAME bridge instance

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

// --- 🛰️ LIVE TELEGRAM LOGGER ---
async function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    try {
        await bot.sendMessage(adminId, `🔔 **LOG:** \`[${time}]\`\n> ${msg}`, { parse_mode: 'Markdown' });
    } catch (e) { console.error("Log failed"); }
}

// --- 🎯 THE UNBREAKABLE TRADE EXECUTION ---
async function executeTrade(direction) {
    try {
        // Fetch session from Singleton bridge
        const { page, cursor } = bridge.get(); 
        const action = direction === "UP" ? "call" : "put";
        const selector = action === 'call' ? '.btn-call' : '.btn-put';

        await log(`Bridge verified. Initializing **${direction}** sequence...`);

        // 1. Human Reaction Jitter (Wait 0.8s - 2.5s)
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1700));
        
        // 2. Physics-based Mouse Pathing
        await log(`Moving mouse to ${direction} button...`);
        await cursor.move(selector);
        
        // 3. UI Click Execution
        const status = await page.evaluate((a) => window.humanClick(a), action);
        
        if (status === "OK") {
            await log(`✅ **TRADE SUCCESS.** Order is live on Pocket Option.`);
        } else {
            await log(`⚠️ **UI ERROR.** Could not find buttons. Make sure the chart is open!`);
        }

    } catch (e) {
        await log(`❌ **BRIDGE ERROR:** ${e.message}`);
    }
}

// --- 📱 TELEGRAM UI ---
bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== adminId) return;
    bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V5.2**", {
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

log("🤖 Bot is standing by for commands.");
