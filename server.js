require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class UniversalPocketBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        this.rsiPeriod = 14;
    }

    async broadcast(msg) {
        console.log(`[SYSTEM]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // Advanced RSI calculation for any market
    calculateRSI(prices) {
        if (prices.length <= this.rsiPeriod) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - this.rsiPeriod; i < prices.length; i++) {
            let diff = prices[i] - prices[i - 1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async findPrice() {
        // Universal selector: looks for the biggest moving number in the trade area
        const priceSelectors = [
            '.current-price', 
            '.price-value', 
            '[class*="currentPrice"]', 
            '.value--main'
        ];
        
        for (let selector of priceSelectors) {
            const el = this.page.locator(selector).first();
            if (await el.isVisible()) {
                const text = await el.innerText();
                const cleanPrice = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (cleanPrice > 0) return cleanPrice;
            }
        }
        return null;
    }

    async start() {
        this.broadcast("🌍 **Universal AI Engine Active.** Scanning page for trade controls...");
        
        while (true) {
            try {
                const price = await this.findPrice();

                if (!price) {
                    console.log("🔍 Scanning page for price chart...");
                    await this.page.waitForTimeout(3000);
                    continue;
                }

                this.priceHistory.push(price);
                if (this.priceHistory.length > 100) this.priceHistory.shift();

                const rsi = this.calculateRSI(this.priceHistory);
                console.log(`[LIVE] Price: ${price} | RSI: ${rsi.toFixed(2)} | History: ${this.priceHistory.length}`);

                // Profit Strategy: RSI Confluence
                if (!this.isTrading && this.priceHistory.length > this.rsiPeriod) {
                    if (rsi >= 70) await this.executeTrade('PUT');
                    else if (rsi <= 30) await this.executeTrade('CALL');
                }

            } catch (err) {
                console.log("⚠️ Page sync issue, retrying...");
            }
            await this.page.waitForTimeout(1000);
        }
    }

    async executeTrade(dir) {
        this.isTrading = true;
        // Universal button selectors for CALL/PUT
        const btnSelector = dir === 'CALL' 
            ? '.btn-call, .up, [class*="btn-up"], .btn-buy' 
            : '.btn-put, .down, [class*="btn-down"], .btn-sell';
            
        try {
            const btn = this.page.locator(btnSelector).first();
            const box = await btn.boundingBox();
            
            if (box) {
                this.broadcast(`🚀 **Universal Signal:** ${dir} at RSI ${this.calculateRSI(this.priceHistory).toFixed(0)}`);
                // Humanized click
                await this.page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 20 });
                await btn.click();
                await this.page.waitForTimeout(61000); // Expiry lock
            }
        } catch (e) {
            console.log("❌ Could not find trade buttons on this page.");
        }
        this.isTrading = false;
    }
}

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        
        // Dynamic tab finding: works regardless of URL
        const pages = context.pages();
        const page = pages.find(p => p.url().includes('pocketoption')) || pages[0];

        const bot = new UniversalPocketBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Open Chrome with port 9222 first.");
    }
})();
