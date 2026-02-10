const { Telegraf } = require('telegraf');
const Database = require('better-sqlite3');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// 1. Initialize DB and Bot
const db = new Database('/data/betting.db');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Setup Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL);
  CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER);
  INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0);
`);

// 2. The Atomic Betting Engine
const executeAtomicBet = db.transaction((amount, prediction) => {
    const row = db.prepare('SELECT balance FROM wallet WHERE id = 1').get();
    if (row.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

    const newNum = Math.floor(Math.random() * 100) + 1;
    const isHigh = newNum > 50;
    const win = (prediction === 'HIGH' && isHigh) || (prediction === 'LOW' && !isHigh);

    const change = win ? amount : -amount;
    db.prepare('UPDATE wallet SET balance = balance + ? WHERE id = 1').run(change);
    db.prepare('INSERT INTO history (num) VALUES (?)').run(newNum);

    return { newNum, win, newBalance: row.balance + change };
});

// 3. Telegram Commands
bot.start((ctx) => ctx.reply('🤖 High-Low Atomic Bot Active. Use /bet [amount] to start.'));

bot.command('balance', (ctx) => {
    const row = db.prepare('SELECT balance FROM wallet WHERE id = 1').get();
    ctx.reply(`💰 Current Balance: $${row.balance.toFixed(2)}`);
});

bot.command('bet', async (ctx) => {
    const amount = parseFloat(ctx.message.text.split(' ')[1]) || 10;
    const chatId = ctx.chat.id;

    try {
        ctx.reply('🧠 Gemini is analyzing the sequence...');
        
        // Get AI Prediction
        const hist = db.prepare('SELECT num FROM history ORDER BY id DESC LIMIT 5').all().map(r => r.num);
        const prompt = `History: ${hist.join(',')}. Predict HIGH (51-100) or LOW (1-50). Return one word only.`;
        const result = await model.generateContent(prompt);
        const prediction = result.response.text().trim().toUpperCase();

        // Execute Atomic Transaction
        const outcome = executeAtomicBet(amount, prediction);

        const message = [
            `🎲 **Prediction:** ${prediction}`,
            `🎰 **Result:** ${outcome.newNum}`,
            `${outcome.win ? '✅ WIN' : '❌ LOSS'}`,
            `💵 **New Balance:** $${outcome.newBalance.toFixed(2)}`
        ].join('\n');

        ctx.replyWithMarkdown(message);
    } catch (err) {
        ctx.reply(`⚠️ Error: ${err.message}`);
    }
});

// Start Bot
bot.launch();
console.log("Telegram Bot is running...");
