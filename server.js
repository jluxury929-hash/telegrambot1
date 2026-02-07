require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const { exec } = require('child_process');

// --- SETTINGS ---
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const RSI_PERIOD = 14;
const OVERBOUGHT = 70; 
const OVERSOLD = 30;   

class AlphaMimicBot {
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
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    calculateRSI(prices) {
        if (prices.length <= RSI_PERIOD) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - RSI_PERIOD; i < prices.length; i++) {
            let diff = prices[i] - prices[i - 1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async getLivePrice() {
        const priceStr = await this.page.locator('.current-price').innerText().catch(() => "0");
        return parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    }

    async execute(dir) {
        const selector = dir === 'CALL' ? '.btn-call' : '.btn-put';
        const box = await this.page.locator(selector).boundingBox();
        if (box) {
            this.broadcast(`🎯 **Signal Found:** RSI Confirmation. Executing ${dir}...`);
            await this.page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 30 });
            await this.page.mouse.click(box.x + box.width/2, box.y + box.height/2);
            await this.page.waitForTimeout(62000); 
        }
    }

    async start() {
        this.broadcast("🧠 **AI Initialized.** I have opened and connected to Chrome.");
        while (true) {
            const price = await this.getLivePrice();
            if (price > 0) {
                this.priceHistory.push(price);
                if (this.priceHistory.length > 50) this.priceHistory.shift();
                const rsi = this.calculateRSI(this.priceHistory);
                
                if (rsi >= OVERBOUGHT && !this.isTrading) {
                    this.isTrading = true;
                    await this.execute('PUT');
                    this.isTrading = false;
                } else if (rsi <= OVERSOLD && !this.isTrading) {
                    this.isTrading = true;
                    await this.execute('CALL');
                    this.isTrading = false;
                }
            }
            await this.page.waitForTimeout(2000);
        }
    }
}

// --- THE AUTO-START REPAIR ---
(async () => {
    console.log("🚀 Step 1: Automatically launching Chrome in Debug Mode...");
    
    // This executes your exact Mac command automatically
    const chromeCmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile" --no-first-run`;
    
    exec(chromeCmd, (err) => {
        if (err) console.log("Note: Chrome might already be open.");
    });

    console.log("⏳ Step 2: Waiting 5s for Chrome to stabilize...");
    await new Promise(r => setTimeout(r, 5000));

    try {
        console.log("🔗 Step 3: Connecting Playwright to the tab...");
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new AlphaMimicBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Try closing all Chrome windows manually and run again.");
    }
})();
