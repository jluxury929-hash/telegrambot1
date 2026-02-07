require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log("🚀 Starting Pocket Option AI Controller...");

// Verify environment variables
if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ ERROR: Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID in .env file.");
    process.exit(1);
}

// Function to start the Python Bot
const startBot = () => {
    // We pass the .env variables directly to Python as environment variables
    const pythonProcess = spawn('python3', [path.join(__dirname, 'bot.py')], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    pythonProcess.stdout.on('data', (data) => {
        console.log(`[AI BOT]: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes("not found")) {
            console.error("❌ CRITICAL: Python3 is not installed in this container.");
        } else {
            console.error(`[AI ERROR]: ${error}`);
        }
    });

    pythonProcess.on('close', (code) => {
        console.log(`[SYSTEM]: Bot process exited with code ${code}. Restarting in 5s...`);
        setTimeout(startBot, 5000); // Auto-restart if it crashes
    });
};

startBot();
