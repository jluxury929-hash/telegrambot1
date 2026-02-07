require('dotenv').config();
const { spawn } = require('child_process');

console.log("💎 Pocket Option Alpha-Bot Controller Active");

const startAI = () => {
    // Passes your .env credentials into the Python AI
    const bot = spawn('python3', ['bot.py'], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    bot.stdout.on('data', (data) => {
        console.log(`[AI]: ${data}`);
    });

    bot.stderr.on('data', (data) => {
        console.error(`[SYSTEM ERROR]: ${data}`);
    });

    bot.on('close', () => {
        console.log("⚠️ Bot disconnected. Rebooting in 10s...");
        setTimeout(startAI, 10000);
    });
};

startAI();
