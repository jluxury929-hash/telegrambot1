require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');

// --- SETTINGS ---
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const RSI_PERIOD = 14;
const OVERBOUGHT = 70; // Sell (PUT) signal
const OVERSOLD = 30;   // Buy (CALL) signal

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
        } catch (e) { /* silent */ }
    }

    // --- QUANTITATIVE ENGINE ---
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
        // Scrapes the current asset price from the Pocket Option UI
        const priceStr = await this.page.locator('.current-price').innerText().catch(() => "0");
        return parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    }

    // --- HUMAN MIMICRY ENGINE ---
    async humanMoveAndClick(selector, action) {
        const box = await this.page.locator(selector).boundingBox();
        if (box) {
            this.broadcast(`🎯 **Analysis Confirmed:** Executing ${action}.`);
            const targetX = box.x + box.width * (0.3 + Math.random() * 0.4);
            const targetY = box.y + box.height * (0.3 + Math.random() * 0.4);
            
            // Shaky, organic movement
            await this.page.mouse.move(targetX, targetY, { steps: Math.floor(Math.random() * 20) + 30 });
            await this.page.waitForTimeout(Math.random() * 1000 + 400);
            await this.page.mouse.click(targetX, targetY);
            
            await this.page.waitForTimeout(62000); // Wait for trade to clear
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

        // CORE STRATEGY LOGIC
        if (rsi >= OVERBOUGHT && !this.isTrading) {
            this.isTrading = true;
            this.broadcast(`📉 **PUT SIGNAL:** RSI is at ${rsi.toFixed(2)} (Overbought). Market reversal expected.`);
            await this.humanMoveAndClick('.btn-put', 'PUT');
            this.isTrading = false;
        } 
        else if (rsi <= OVERSOLD && !this.isTrading) {
            this.isTrading = true;
            this.broadcast(`📈 **CALL SIGNAL:** RSI is at ${rsi.toFixed(2)} (Oversold). Market bounce expected.`);
            await this.humanMoveAndClick('.btn-call', 'CALL');
            this.isTrading = false;
        }
    }

    async start() {
        this.broadcast("🧠 **Quantitative AI Engine Online.** Analyzing real-time price action...");
        
        while (true) {
            await this.analyze();
            
            // Randomly use a "Feature" to maintain human profile
            if (Math.random() > 0.9) {
                await this.page.mouse.wheel(0, (Math.random() - 0.5) * 300);
                await this.page.waitForTimeout(2000);
            }

            await this.page.waitForTimeout(2000); // Check every 2 seconds
        }
    }
}

// MAIN EXECUTION
(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const pages = context.pages();
        const page = pages.find(p => p.url().includes('pocketoption')) || pages[0];

        const bot = new WorldsBestAnalysisBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Open Chrome on Port 9222 first!");
    }
})();
