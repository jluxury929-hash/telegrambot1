require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const { exec } = require('child_process');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const RSI_PERIOD = 14;

class OmniGhostBot {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        this.controlMap = new Map();
        this.isPausedByHuman = false;
        this.lastHumanAction = Date.now();
    }

    async broadcast(msg) {
        console.log(`[AI-GHOST]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- STEP 1: SCAN & LEARN ---
    async scanAndLearn() {
        this.broadcast("🕵️ **Deep Scan:** Mapping site infrastructure...");
        const elements = await this.page.locator('button, a, .btn, .side-menu__link').all();
        
        for (const el of elements) {
            try {
                const text = (await el.innerText()).trim().toLowerCase();
                if (text.includes('call') || text.includes('higher')) this.controlMap.set('CALL', el);
                if (text.includes('put') || text.includes('lower')) this.controlMap.set('PUT', el);
            } catch (e) {}
        }
        this.broadcast(`🧠 **Learning complete.** Mapped ${this.controlMap.size} trade nodes.`);
    }

    // --- STEP 2: MANUAL OVERRIDE DETECTION ---
    // Injects a script to detect if YOU are using the mouse
    async setupHumanOverride() {
        await this.page.exposeFunction('onHumanActivity', () => {
            if (!this.isPausedByHuman) {
                this.isPausedByHuman = true;
                this.broadcast("⚠️ **Manual Override:** Human detected. Pausing AI...");
            }
            this.lastHumanAction = Date.now();
        });

        await this.page.addInitScript(() => {
            window.addEventListener('mousemove', () => window.onHumanActivity());
            window.addEventListener('mousedown', () => window.onHumanActivity());
            window.addEventListener('keydown', () => window.onHumanActivity());
        });
    }

    // --- STEP 3: MOST PROFITABLE EXECUTION ---
    calculateRSI(prices) {
        if (prices.length <= RSI_PERIOD) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - RSI_PERIOD; i < prices.length; i++) {
            let diff = prices[i] - prices[i - 1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async start() {
        await this.setupHumanOverride();
        await this.scanAndLearn();
        
        this.broadcast("🚀 **Ghost Mode Active.** I am now monitoring everything.");

        while (true) {
            // Check if human stopped interacting (3 second grace period)
            if (this.isPausedByHuman && Date.now() - this.lastHumanAction > 3000) {
                this.isPausedByHuman = false;
                this.broadcast("🔄 **Resuming:** Mouse clear. AI taking control.");
            }

            if (!this.isPausedByHuman && !this.isTrading) {
                const priceStr = await this.page.locator('.current-price').first().innerText().catch(() => "0");
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 50) this.priceHistory.shift();
                    
                    const rsi = this.calculateRSI(this.priceHistory);
                    console.log(`Price: ${price} | RSI: ${rsi.toFixed(2)}`);

                    if (rsi >= 70) await this.execute('PUT');
                    else if (rsi <= 30) await this.execute('CALL');
                }
            }
            await this.page.waitForTimeout(1000);
        }
    }

    async execute(dir) {
        this.isTrading = true;
        const btn = this.controlMap.get(dir);
        if (btn) {
            const box = await btn.boundingBox();
            // Human-like curved trajectory
            await this.page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 25 });
            await btn.click();
            this.broadcast(`🎯 **Profit Entry:** ${dir} at RSI ${this.calculateRSI(this.priceHistory).toFixed(0)}`);
            await this.page.waitForTimeout(61000); 
        }
        this.isTrading = false;
    }
}

// --- BOOTSTRAP: AUTO-LAUNCH CHROME & NAVIGATE ---
(async () => {
    console.log("🚀 Launching Chrome...");
    const cmd = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile" --no-first-run`;
    exec(cmd);
    
    await new Promise(r => setTimeout(r, 5000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        
        // Ensure we open Pocket Option immediately
        if (!page.url().includes('pocketoption.com')) {
            console.log("📍 Navigating to Pocket Option Trade Room...");
            await page.goto('https://pocketoption.com/en/cabinet/', { waitUntil: 'networkidle' });
        }

        const bot = new OmniGhostBot(page);
        await bot.start();
    } catch (e) {
        console.error("❌ ERROR: Connection failed. Close all Chrome windows and restart.");
    }
})();
