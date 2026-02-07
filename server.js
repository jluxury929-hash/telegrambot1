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
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        try {
            await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown' });
        } catch (e) { console.error("Telegram error"); }
    }

    async humanMove(x, y) {
        const steps = 20 + Math.floor(Math.random() * 15);
        for (let i = 0; i <= steps; i++) {
            await this.page.mouse.move(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5);
            await this.page.waitForTimeout(20);
        }
    }

    async run() {
        await this.broadcast("🟢 **Railway AI Online.** Monitoring Pocket Option...");
        while (true) {
            // Analytics Simulation
            const signal = Math.random() > 0.97 ? (Math.random() > 0.5 ? "CALL" : "PUT") : "WAIT";
            
            if (signal !== "WAIT") {
                this.broadcast(`🚀 Signal detected: ${signal}. Executing trade...`);
                const selector = signal === "CALL" ? ".btn-call" : ".btn-put";
                try {
                    const box = await this.page.locator(selector).boundingBox();
                    if (box) {
                        await this.humanMove(box.x + box.width/2, box.y + box.height/2);
                        await this.page.mouse.click(box.x + box.width/2, box.y + box.height/2);
                        await this.page.waitForTimeout(61000); // 1 minute trade
                    }
                } catch (e) { this.broadcast("⚠️ Click failed. Is the chart loaded?"); }
            }
            await this.page.waitForTimeout(Math.random() * 30000 + 10000);
        }
    }
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    // Logic to add your manual login session from cookies would go here
    const page = await context.newPage();
    await page.goto('https://pocketoption.com/en/cabinet/');
    
    const bot = new PocketBotJS(page);
    await bot.run();
})();
