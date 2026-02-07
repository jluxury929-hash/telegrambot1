require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const { exec } = require('child_process');

// --- SETTINGS ---
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const RSI_PERIOD = 14;
const OVERBOUGHT = 70; 
const OVERSOLD = 30;   

class WorldsBestAnalysisBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
    }

    async broadcast(msg) {
        console.log(`[ANALYSIS]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: msg,
                parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    calculateRSI(prices) {
        if (prices.length <= RSI_PERIOD) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - RSI_PERIOD; i < prices.length; i++) {
            let diff = prices[i] - prices[i - 1];
            if (diff >= 0) gains += diff;
            else losses -= diff;
        }
        let rs = gains / (losses || 1);
        return 100 - (100 / (1 + rs));
    }

    async getLivePrice() {
        const priceStr = await this.page.locator('.current-price').innerText().catch(() => "0");
        return parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    }

    async humanMoveAndClick(selector, action) {
        const box = await this.page.locator(selector).boundingBox();
        if (box) {
            this.broadcast(`🎯 **Analysis Confirmed:** Executing ${action}.`);
            const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
            const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
            await this.page.mouse.move(targetX, targetY, { steps: 35 });
            await this.page.waitForTimeout(600);
            await this.page.mouse.click(targetX, targetY);
            await this.page.waitForTimeout(62000); 
        }
    }

    async analyze() {
        const price = await this.getLivePrice();
        if (price > 0) {
            this.priceHistory.push(price);
            if (this.priceHistory.length > 50) this.priceHistory.shift();
        }
        const rsi = this.calculateRSI(this.priceHistory);
        console.log(`[DATA]: Price: ${price} | RSI: ${rsi.toFixed(2)}`);

        if (rsi >= OVERBOUGHT && !this.isTrading) {
            this.isTrading = true;
            await this.humanMoveAndClick('.btn-put', 'PUT');
            this.isTrading = false;
        } else if (rsi <= OVERSOLD && !this.isTrading) {
            this.isTrading = true;
            await this.humanMoveAndClick('.btn-call', 'CALL');
            this.isTrading = false;
        }
    }

    async start() {
        this.broadcast("🧠 **Quantitative AI Engine Online.** Analyzing live...");
        while (true) {
            await this.analyze();
            await this.page.waitForTimeout(2000);
        }
    }
}

// --- AUTO-LAUNCH LOGIC ---
(async () => {
    console.log("🚀 Launching Chrome in Debug Mode...");
    
    // Commands for MacOS
    const chromeCmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile"`;
    
    exec(chromeCmd, (err) => {
        if (err) console.error("❌ Failed to launch Chrome:", err);
    });

    // Wait for Chrome to warm up
    console.log("⏳ Waiting for Chrome to initialize...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        // Auto-navigate to the trade room if not already there
        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/');
        }

        const bot = new WorldsBestAnalysisBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Try closing all Chrome instances first.");
    }
})();
