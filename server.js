require('dotenv').config();
const { chromium } = require('playwright');
const robot = require('robotjs'); // Physical control
const axios = require('axios');
const { exec } = require('child_process');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class TitanPhysicalAI {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        // High-Profit Indicator Settings
        this.rsiPeriod = 14;
        this.overbought = 75; // More conservative for higher profit
        this.oversold = 25;
    }

    async broadcast(msg) {
        console.log(`[TITAN]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- FEATURE SCANNER ---
    // Scans the screen and maps buttons to physical coordinates
    async scanAndMap() {
        this.broadcast("🔍 **Scanning Features...** Mapping UI to Physical Coordinates.");
        const callBtn = this.page.locator('.btn-call').first();
        const putBtn = this.page.locator('.btn-put').first();

        this.callCoords = await callBtn.boundingBox();
        this.putCoords = await putBtn.boundingBox();

        if (!this.callCoords || !this.putCoords) {
            throw new Error("Could not find trade buttons. Is the chart open?");
        }
    }

    // --- PHYSICAL EXECUTION ENGINE ---
    async executePhysicalTrade(dir) {
        this.isTrading = true;
        const coords = dir === 'CALL' ? this.callCoords : this.putCoords;
        
        // 1. Move REAL mouse to the button
        // We add 80px for the Mac Chrome header/tabs
        const x = coords.x + coords.width / 2;
        const y = coords.y + coords.height / 2 + 80;

        this.broadcast(`🎯 **PROFIT SIGNAL:** Moving physical mouse to ${dir}.`);
        robot.moveMouseSmooth(x, y);
        
        // 2. Click the REAL mouse
        robot.mouseClick();

        // 3. Backup: Tap the HOTKEY (Shift + W/S)
        robot.keyTap(dir === 'CALL' ? 'w' : 's', 'shift');

        // 4. Wait for trade to clear
        await this.page.waitForTimeout(62000);
        this.isTrading = false;
    }

    // --- WORLD'S BEST ANALYSIS ---
    calculateRSI(prices) {
        if (prices.length <= this.rsiPeriod) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - this.rsiPeriod; i < prices.length; i++) {
            let diff = prices[i] - prices[i - 1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async run() {
        await this.scanAndMap();
        this.broadcast("🚀 **Titan Online.** Physical control engaged.");

        while (true) {
            try {
                const priceStr = await this.page.locator('.current-price').innerText().catch(() => "0");
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 100) this.priceHistory.shift();

                    const rsi = this.calculateRSI(this.priceHistory);
                    console.log(`[ANALYSIS] Price: ${price} | RSI: ${rsi.toFixed(2)}`);

                    if (!this.isTrading && this.priceHistory.length > this.rsiPeriod) {
                        if (rsi >= this.overbought) await this.executePhysicalTrade('PUT');
                        else if (rsi <= this.oversold) await this.executePhysicalTrade('CALL');
                    }
                }
            } catch (err) {
                console.log("Searching for price...");
            }
            await this.page.waitForTimeout(1000);
        }
    }
}

// --- BOOTSTRAP ---
(async () => {
    // 1. Launch Chrome
    const cmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile" --no-first-run`;
    exec(cmd);
    await new Promise(r => setTimeout(r, 6000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = (await browser.contexts()[0].pages()).find(p => p.url().includes('pocketoption')) || (await browser.contexts()[0].pages())[0];
        
        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new TitanPhysicalAI(page);
        await bot.run();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Enable Accessibility in Mac Settings!");
    }
})();
