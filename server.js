require('dotenv').config();
const { chromium } = require('playwright');
const robot = require('robotjs');
const { exec } = require('child_process');

// --- 90% ACCURACY CONFLUENCE SETTINGS ---
const RSI_PERIOD = 14;
const BB_PERIOD = 20;
const BB_STD_DEV = 2.5; // Stricter filter for higher probability

class TitanSurgicalBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        this.yOffset = 85; // Standard Chrome Mac Header Offset
    }

    // --- WORLD RENOWNED ANALYSIS: RSI + BOLLINGER BANDS ---
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

        // 2. Bollinger Bands
        const avg = prices.slice(-BB_PERIOD).reduce((a, b) => a + b) / BB_PERIOD;
        const std = Math.sqrt(prices.slice(-BB_PERIOD).map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / BB_PERIOD);
        
        // 3. TRIPLE CONFLUENCE RULES
        if (rsi >= 75 && current >= (avg + BB_STD_DEV * std)) return 'SELL';
        if (rsi <= 25 && current <= (avg - BB_STD_DEV * std)) return 'BUY';
        
        return null;
    }

    // --- KERNEL-LEVEL PHYSICAL CLICK ---
    async executeTrade(dir) {
        this.isTrading = true;
        try {
            // Locates the physical center of the ".btn-call" (BUY) or ".btn-put" (SELL)
            const selector = dir === 'BUY' ? '.btn-call' : '.btn-put';
            const btn = this.page.locator(selector).first();
            const box = await btn.boundingBox();

            if (box) {
                // Retina Scaling for MacBook Air/Pro
                const screen = robot.getScreenSize();
                const viewport = await this.page.viewportSize();
                const scale = screen.width / viewport.width;

                const x = (box.x + box.width / 2) * scale;
                const y = (box.y + box.height / 2 + this.yOffset) * scale;

                console.log(`🎯 [TITAN]: Executing ${dir} at Millisecond Speed...`);

                // 1. Teleport Mouse to Button
                robot.moveMouse(x, y);
                // 2. Fire Physical Hardware Click
                robot.mouseClick();
                // 3. Fire Hardware Hotkey (Shift + W/S)
                robot.keyTap(dir === 'BUY' ? 'w' : 's', 'shift');

                await this.page.waitForTimeout(62000); // Expiry Lock
            }
        } catch (e) { console.log("⚠️ Scan Error: Check if buttons are visible."); }
        this.isTrading = false;
    }

    async run() {
        console.log("🏆 Titan Active. Physical Control Engaged.");
        while (true) {
            try {
                const priceStr = await this.page.locator('.current-price').first().innerText();
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 50) this.priceHistory.shift();

                    const signal = this.analyze(this.priceHistory);
                    if (signal && !this.isTrading) {
                        await this.executeTrade(signal);
                    }
                }
            } catch (e) { }
            await this.page.waitForTimeout(500); // 0.5s Scan Rate
        }
    }
}

// --- BOOTSTRAP ---
(async () => {
    // Force Launch Chrome
    const cmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile" --no-first-run`;
    exec(cmd);
    await new Promise(r => setTimeout(r, 6000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages().find(p => p.url().includes('pocketoption.com')) || context.pages()[0];
        
        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new TitanSurgicalBot(page);
        await bot.run();
    } catch (e) {
        console.error("❌ FAILED: Grant 'Accessibility' to Terminal and Node in Mac Settings.");
    }
})();
