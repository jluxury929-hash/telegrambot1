require('dotenv').config();
const { chromium } = require('playwright');
const robot = require('robotjs');
const { exec } = require('child_process');
const axios = require('axios');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class TitanMaster {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        // Mac UI Offset: Adjusted for Chrome's address bar/tabs on macOS
        this.yOffset = 85; 
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

    // --- HARDWARE CALIBRATION ---
    async getRetinaScale() {
        const screen = robot.getScreenSize();
        const viewport = await this.page.viewportSize();
        // Calculates the Retina multiplier (usually 2 on MacBooks)
        return screen.width / viewport.width;
    }

    // --- PROFITABLE FEATURE SCAN ---
    async getInternalSignal() {
        try {
            // Scrapes the Signal enabled in your Settings > AI Trading
            const signalText = await this.page.locator('.ai-recommendation-value').innerText();
            if (signalText.includes('Strong Buy')) return 'CALL';
            if (signalText.includes('Strong Sell')) return 'PUT';
            return null;
        } catch (e) { return null; }
    }

    // --- PHYSICAL EXECUTION ---
    async executeHardwareTrade(dir) {
        this.isTrading = true;
        const selector = dir === 'CALL' ? '.btn-call' : '.btn-put';
        const btn = this.page.locator(selector).first();
        const box = await btn.boundingBox();

        if (box) {
            const scale = await this.getRetinaScale();
            // Calculate pixel-perfect center of the button on YOUR Mac screen
            const x = (box.x + box.width / 2) * scale;
            const y = (box.y + box.height / 2 + this.yOffset) * scale;

            this.broadcast(`🎯 **TITAN EXECUTION:** Moving physical mouse to ${dir}.`);
            
            // Physical Hardware Control
            robot.moveMouseSmooth(x, y);
            robot.mouseClick();

            // Hardware Key Injection: Uses the Shift + W/S hotkeys from Settings
            robot.keyTap(dir === 'CALL' ? 'w' : 's', 'shift');
            
            await this.page.waitForTimeout(62000); // 1-minute lock
        }
        this.isTrading = false;
    }

    async run() {
        this.broadcast("🏆 **Titan AI Active.** Control: Physical Mouse/Keyboard.");
        
        while (true) {
            try {
                const signal = await this.getInternalSignal();
                
                // You can also add your RSI logic here for Double-Confirmation
                if (signal && !this.isTrading) {
                    await this.executeHardwareTrade(signal);
                }
            } catch (err) {
                console.log("Syncing with UI...");
            }
            await this.page.waitForTimeout(1000);
        }
    }
}

// --- BOOTSTRAP ---
(async () => {
    // 1. Force Launch Chrome in Debug Mode
    const cmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile"`;
    exec(cmd);
    await new Promise(r => setTimeout(r, 6000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages().find(p => p.url().includes('pocketoption')) || context.pages()[0];

        if (!page.url().includes('pocketoption.com')) {
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'load' });
        }

        const bot = new TitanMaster(page);
        await bot.run();
    } catch (e) {
        console.error("❌ FATAL: Check Permissions or Restart Chrome.");
    }
})();
