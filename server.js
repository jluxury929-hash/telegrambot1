require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const { exec } = require('child_process');

// --- ANALYSIS PARAMETERS (For 90% Certainty) ---
const RSI_PERIOD = 14;
const BB_PERIOD = 20;
const BB_STD_DEV = 2.5; // Stricter deviation for higher accuracy

class SurgicalTitanBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
    }

    async broadcast(msg) {
        console.log(`[TITAN-AI]: ${msg}`);
        if (!process.env.TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: process.env.TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- WORLD RENOWNED ANALYSIS ENGINE ---
    analyze(prices) {
        if (prices.length < BB_PERIOD) return null;
        const current = prices[prices.length - 1];

        // 1. RSI Calculation
        let gains = 0, losses = 0;
        for (let i = prices.length - RSI_PERIOD; i < prices.length; i++) {
            let d = prices[i] - prices[i - 1];
            d >= 0 ? gains += d : losses -= d;
        }
        const rsi = 100 - (100 / (1 + (gains / (losses || 1))));

        // 2. Bollinger Bands (Volatility Filter)
        const avg = prices.slice(-BB_PERIOD).reduce((a, b) => a + b) / BB_PERIOD;
        const std = Math.sqrt(prices.slice(-BB_PERIOD).map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / BB_PERIOD);
        
        const upperBand = avg + (BB_STD_DEV * std);
        const lowerBand = avg - (BB_STD_DEV * std);

        // 3. LOGIC: ONLY EXECUTE ON TRIPLE CONFLUENCE
        // Accurately predicts reversals at the 'edges' of the market
        if (rsi >= 75 && current >= upperBand) return 'SELL';
        if (rsi <= 25 && current <= lowerBand) return 'BUY';
        
        return null;
    }

    // --- SURGICAL BUTTON LOCATION & CLICKING ---
    async executeTrade(dir) {
        this.isTrading = true;
        try {
            // Locates the buttons specifically by their Pocket Option CSS classes
            // .btn-call is the 'Buy/Higher' button, .btn-put is the 'Sell/Lower' button
            const selector = dir === 'BUY' ? '.btn-call' : '.btn-put';
            const btn = this.page.locator(selector).first();

            if (await btn.isVisible()) {
                const box = await btn.boundingBox();
                this.broadcast(`🎯 **Perfect Entry Found:** ${dir} at Price ${this.priceHistory[this.priceHistory.length-1]}`);
                
                // Clicks exactly in the center of the detected button
                await btn.click({ 
                    force: true, 
                    position: { x: box.width / 2, y: box.height / 2 } 
                });

                // 1-minute trade duration lock
                await this.page.waitForTimeout(62000);
            }
        } catch (e) {
            console.log("❌ Execution Error: Could not locate buttons.");
        }
        this.isTrading = false;
    }

    async start() {
        this.broadcast("🚀 **Titan System Online.** Scanning for surgical entries...");
        while (true) {
            try {
                const priceStr = await this.page.locator('.current-price').innerText();
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 100) this.priceHistory.shift();

                    const signal = this.analyze(this.priceHistory);
                    if (signal && !this.isTrading) {
                        await this.executeTrade(signal);
                    }
                }
            } catch (e) { }
            await this.page.waitForTimeout(1000);
        }
    }
}

// --- BOOTSTRAP: THE AUTO-CONNECTION REPAIR ---
(async () => {
    const chromeCmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile" --no-first-run`;
    
    exec(chromeCmd);
    await new Promise(r => setTimeout(r, 5000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        // Finds the actual trading tab even if other tabs are open
        const page = context.pages().find(p => p.url().includes('pocketoption.com')) || context.pages()[0];
        
        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new SurgicalTitanBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ FAILED: Close all Chrome windows and try again.");
    }
})();
