// bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const bridge = require('./bridge');
const { startEngine } = require('./launcher'); // Import the launcher function

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    try {
        await bot.sendMessage(adminId, `🔔 **LOG:** \`[${time}]\`\n> ${msg}`, { parse_mode: 'Markdown' });
    } catch (e) { console.error("Log failed"); }
}

// --- 📱 TELEGRAM UI ---
bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== adminId) return;

    await log("🌐 **INITIALIZING BROWSER...** Please wait.");
    
    try {
        const page = await startEngine();
        
        bot.sendMessage(msg.chat.id, "💎 **STEALTH TERMINAL V5.5**\n\n✅ Browser opened successfully.\n🔑 **ACTION REQUIRED:** Log into Pocket Option in the Chrome window now!", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📈 CALL (UP)", callback_data: "up" }, { text: "📉 PUT (DOWN)", callback_data: "down" }]
                ]
            }
        });

        // Optional: Wait for login automatically
        await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
        await log("🚀 **LOGIN DETECTED.** Bridge is 100% active and ready for trades.");

    } catch (e) {
        await log(`❌ **LAUNCH FAILED:** ${e.message}`);
    }
});

// --- EXECUTION HANDLER ---
async function executeTrade(direction) {
    try {
        const { page, cursor } = bridge.get(); 
        const action = direction === "UP" ? "call" : "put";
        const selector = action === 'call' ? '.btn-call' : '.btn-put';

        await log(`Moving mouse for **${direction}**...`);
        await cursor.move(selector);
        
        const status = await page.evaluate((a) => window.humanClick(a), action);
        if (status === "OK") await log(`✅ **BET PLACED!**`);
        else await log(`⚠️ **UI ERROR:** Button missing.`);
    } catch (e) { await log(`❌ ${e.message}`); }
}

bot.on('callback_query', (q) => {
    if (q.data === "up") executeTrade("UP");
    if (q.data === "down") executeTrade("DOWN");
    bot.answerCallbackQuery(q.id);
});

log("🤖 Bot Intelligence Online. Type /start in Telegram.");
