require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const adminId = 6588957206;

async function executeStealthTrade(direction, chatId) {
    const page = global.brokerPage;
    const cursor = global.ghostCursor;

    if (!page) return bot.sendMessage(chatId, "❌ Bridge Lost. Restart Launcher.");

    // Pocket Option 2026 Selectors
    const action = direction.includes("HIGHER") ? ".btn-call" : ".btn-put";

    try {
        // 1. HUMAN REACTION JITTER (Random 0.7s - 2.5s)
        const reactionDelay = 700 + Math.random() * 1800;
        await new Promise(r => setTimeout(r, reactionDelay));

        // 2. CURVED MOUSE MOVEMENT (Natural physics-based movement)
        await cursor.move(action);
        
        // 3. PHYSICAL CLICK (Triggering the site's own event listeners)
        const result = await page.evaluate((sel) => window.humanClick(sel), action);

        if (result === "SUCCESS") {
            bot.sendMessage(chatId, `🚀 **Bet Placed!**\nAction: \`${direction}\`\nStatus: \`Mimicked Human Click\``, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(chatId, "❌ Trading button not visible in browser tab.");
        }
    } catch (e) {
        bot.sendMessage(chatId, "❌ Stealth Execution Error.");
    }
}

bot.onText(/\/execute/, (msg) => {
    if (msg.from.id !== adminId) return;
    executeStealthTrade("HIGHER 📈", msg.chat.id);
});

console.log("🤖 Stealth Bot logic active.");
