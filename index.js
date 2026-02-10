const { Telegraf, Markup } = require('telegraf');
const Database = require('better-sqlite3');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// 1. Initialize DB (Path for Railway Volume)
const db = new Database('/data/betting.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL);
  CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER);
  INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0);
`);

// 2. Initialize Gemini and Telegram
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 3. The Atomic Betting Engine
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

// 4. HANDLER: The /start command
bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `🤖 **Welcome to Gemini Atomic Bet Bot!**\n\nI am connected to Gemini AI and use an atomic transaction engine to ensure your virtual funds are always safe.\n\n💰 **Bankroll:** $1,000.00\n\nUse the buttons below to play:`,
        Markup.keyboard([
            ['📈 Bet $10 HIGH', '📉 Bet $10 LOW'],
            ['💰 Check Balance', '🔄 Reset Game']
        ]).resize()
    );
});

// 5. HANDLER: Text triggers for the buttons
bot.hears(/Bet \$10 (HIGH|LOW)/, async (ctx) => {
    const prediction = ctx.match[1];
    ctx.reply(`🧠 Gemini is analyzing history...`);

    try {
        const hist = db.prepare('SELECT num FROM history ORDER BY id DESC LIMIT 5').all().map(r => r.num);
        const prompt = `Recent numbers: ${hist.join(',')}. Predict if next is HIGH (51-100) or LOW (1-50). Return only the word.`;
        const result = await model.generateContent(prompt);
        
        const outcome = executeAtomicBet(10, prediction);
        const status = outcome.win ? '✅ WIN' : '❌ LOSS';

        ctx.replyWithMarkdown(`🎲 **Result:** ${outcome.newNum}\n${status}\n💵 **New Balance:** $${outcome.newBalance.toFixed(2)}`);
    } catch (err) {
        ctx.reply(`⚠️ ${err.message === 'INSUFFICIENT_FUNDS' ? 'You are broke! Use /reset' : 'Gemini error. Try again.'}`);
    }
});

bot.hears('💰 Check Balance', (ctx) => {
    const row = db.prepare('SELECT balance FROM wallet WHERE id = 1').get();
    ctx.reply(`💰 Your balance: $${row.balance.toFixed(2)}`);
});

bot.hears('🔄 Reset Game', (ctx) => {
    db.prepare('UPDATE wallet SET balance = 1000.0 WHERE id = 1').run();
    ctx.reply('🔄 Game reset! Your balance is back to $1,000.00.');
});

// 6. Launch
bot.launch();
console.log("Bot is online. Send /start in Telegram.");
