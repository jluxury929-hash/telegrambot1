require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class PocketBotJS {
    constructor(page) {
        this.page = page;
    }

    async broadcast(msg) {
        console.log(`[BOT]: ${msg}`);
        if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        try {
            await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' });
        } catch (e) { console.error("Telegram error"); }
    }

    async run() {
        await this.broadcast("🟢 **Railway AI Online.** Session started in Headless mode.");
        while (true) {
            // Your trading logic here
            const signal = Math.random() > 0.98 ? "CALL" : (Math.random() < 0.02 ? "PUT" : "WAIT");
            
            if (signal !== "WAIT") {
                this.broadcast(`🚀 Strategy Signal: ${signal}`);
                // Add your click logic here
            }
            
            await this.page.waitForTimeout(30000); // Check every 30s
        }
    }
}

(async () => {
    try {
        // HEADLESS MUST BE TRUE FOR RAILWAY
        const browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        
        // Go to the site
        await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'networkidle' });
        
        const bot = new PocketBotJS(page);
        await bot.run();
    } catch (err) {
        console.error("FATAL ERROR:", err);
    }
})();
