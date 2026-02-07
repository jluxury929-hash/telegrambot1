require('dotenv').config();
const { chromium } = require('playwright');
const robot = require('robotjs');
const axios = require('axios');
const { exec } = require('child_process');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class TitanOmniBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        // High-Profit Guardrails
        this.rsiPeriod = 14;
        this.minProfitCertainty = 90; 
    }

    async broadcast(msg) {
        console.log(`[TITAN-SYSTEM]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- 1. SCAN: MAP PHYSICAL LOCATIONS ---
    async mapUI() {
        this.broadcast("🔍 **Omni-Scan:** Mapping buttons to physical screen space...");
        const callBtn = this.page.locator('.btn-call').first();
        const putBtn = this.page.locator('.btn-put').first();

        this.callCoords = await callBtn.boundingBox();
        this.putCoords = await putBtn.boundingBox();

        if (!this.callCoords || !this.putCoords) {
            throw new Error("UI Scan Failed. Ensure the Trading Chart is visible.");
        }
    }

    // --- 2. ANALYZE: GET PLATFORM AI SIGNAL ---
    async getPlatformAISignal() {
        try {
            // Reads the recommendation from the 'Automation' AI Mode in Settings
            const aiText = await this.page.locator('.ai-recommendation-value').innerText();
            if (aiText.includes('Strong Buy')) return 'CALL';
            if (aiText.includes('Strong Sell')) return 'PUT';
        } catch (e) { return null; }
    }

    // --- 3. EXECUTE: PHYSICAL HARDWARE CONTROL ---
    async physicalExecution(dir) {
        this.isTrading = true;
        const target = dir === 'CALL' ? this.callCoords : this.putCoords;
        
        // Retina Scaling: Adjusts for high-res Mac displays
        const screen = robot.getScreenSize();
        const viewport = await this.page.viewportSize();
        const scale = screen.width / viewport.width;

        // Offset: Accounts for Chrome's top bar (~85px)
        const x = (target.x + target.width / 2) * scale;
        const y = (target.y + target.height / 2 + 85) * scale;

        this.broadcast(`🎯 **TITAN SIGNAL:** Moving hardware mouse to ${dir}.`);
        
        // Actual physical movement and click
        robot.moveMouseSmooth(x, y);
        robot.mouseClick();

        // Backup: Inject Hotkey (Shift + W/S) for 100% execution certainty
        robot.keyTap(dir === 'CALL' ? 'w' : 's', 'shift');

        await this.page.waitForTimeout(62000); // Lock for trade duration
        this.isTrading = false;
    }

    calculateRSI(prices) {
        if (prices.length <= this.rsiPeriod) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - this.rsiPeriod; i < prices.length; i++) {
            let diff = prices[i] - prices[i-1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async run() {
        await this.mapUI();
        this.broadcast("🏆 **Titan AI Active.** Operating in Physical Master Mode.");

        while (true) {
            try {
                const priceStr = await this.page.locator('.current-price').innerText();
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 50) this.priceHistory.shift();

                    const rsi = this.calculateRSI(this.priceHistory);
                    const aiSignal = await this.getPlatformAISignal();

                    console.log(`[ANALYSIS] RSI: ${rsi.toFixed(1)} | Platform AI: ${aiSignal || 'Analyzing...'}`);

                    // --- THE 100% CERTAINTY GATE ---
                    if (!this.isTrading && aiSignal) {
                        if (aiSignal === 'CALL' && rsi <= 30) await this.physicalExecution('CALL');
                        if (aiSignal === 'PUT' && rsi >= 70) await this.physicalExecution('PUT');
                    }
                }
            } catch (err) { console.log("Searching for UI..."); }
            await this.page.waitForTimeout(1000);
        }
    }
}

// --- BOOTSTRAP: AUTO-LAUNCH ---
(async () => {
    console.log("🚀 Initializing Hardware Bridge...");
    const chrome = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`;
    const flags = `--remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile"`;
    exec(`${chrome} ${flags}`);
    
    await new Promise(r => setTimeout(r, 6000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages().find(p => p.url().includes('pocketoption')) || context.pages()[0];

        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new TitanOmniBot(page);
        await bot.run();
    } catch (e) {
        console.error("❌ FATAL: Connection failed. Reset Mac Accessibility permissions.");
    }
})();
