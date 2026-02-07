require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class OmniAwareAI {
    constructor(page) {
        this.page = page;
        this.controlMap = new Map();
        this.priceHistory = [];
        this.isTrading = false;
        this.signalsIgnored = 0;
    }

    async broadcast(msg) {
        console.log(`[AI-OMNI]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- STEP 1: SCAN AND LEARN ---
    async discoveryPhase() {
        this.broadcast("🕵️ **Scanning entire site infrastructure...**");
        const elements = await this.page.locator('button, a, [role="button"], .btn, .side-menu__link').all();
        
        for (const el of elements) {
            try {
                const text = (await el.innerText()).trim().toLowerCase();
                const isVisible = await el.isVisible();
                
                if (text && isVisible) {
                    if (text.includes('call') || text.includes('higher')) this.controlMap.set('CALL', el);
                    if (text.includes('put') || text.includes('lower')) this.controlMap.set('PUT', el);
                    if (text.includes('signals')) this.controlMap.set('SIGNALS', el);
                    if (text.includes('social')) this.controlMap.set('SOCIAL', el);
                    if (text.includes('demo') || text.includes('real')) this.controlMap.set('ACCOUNT_TYPE', el);
                }
            } catch (e) {}
        }
        this.broadcast(`🧠 **Learning complete.** Mapped ${this.controlMap.size} system nodes.`);
    }

    // --- STEP 2: MOST PROFITABLE ANALYSIS ---
    // Calculates a High-Conviction score (must be >80 to trade)
    async getProfitabilityScore() {
        const priceStr = await this.page.locator('.current-price').first().innerText().catch(() => "0");
        const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
        if (!price) return 0;

        this.priceHistory.push(price);
        if (this.priceHistory.length > 100) this.priceHistory.shift();
        if (this.priceHistory.length < 20) return 0;

        // RSI Calculation
        let gains = 0, losses = 0;
        for (let i = this.priceHistory.length - 14; i < this.priceHistory.length; i++) {
            let diff = this.priceHistory[i] - this.priceHistory[i - 1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        const rsi = 100 - (100 / (1 + (gains / (losses || 1))));
        
        // Bollinger Band Estimation (Standard Deviation)
        const avg = this.priceHistory.reduce((a, b) => a + b) / this.priceHistory.length;
        const squareDiffs = this.priceHistory.map(p => Math.pow(p - avg, 2));
        const stdDev = Math.sqrt(squareDiffs.reduce((a, b) => a + b) / squareDiffs.length);
        
        const upperBand = avg + (stdDev * 2);
        const lowerBand = avg - (stdDev * 2);

        // CONFLUENCE LOGIC: RSI + BB Breakout
        if (rsi <= 30 && price <= lowerBand) return 95; // Extreme Oversold + Support
        if (rsi >= 70 && price >= upperBand) return -95; // Extreme Overbought + Resistance
        
        return 0;
    }

    // --- STEP 3: OPERATE ---
    async run() {
        await this.discoveryPhase();

        while (true) {
            const score = await this.getProfitabilityScore();
            
            if (Math.abs(score) >= 90 && !this.isTrading) {
                const dir = score > 0 ? 'CALL' : 'PUT';
                await this.execute(dir);
            } else {
                this.signalsIgnored++;
                if (this.signalsIgnored % 20 === 0) {
                    await this.broadcast("📊 *Scanning:* No high-conviction entries found. Maintaining capital safety.");
                    if (Math.random() > 0.8) await this.interactWithFeatures();
                }
            }
            await this.page.waitForTimeout(2000);
        }
    }

    async execute(dir) {
        this.isTrading = true;
        const btn = this.controlMap.get(dir);
        if (btn) {
            this.broadcast(`🎯 **PROFIT TRIGGER:** High-probability ${dir} signal. Executing...`);
            const box = await btn.boundingBox();
            await this.page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 30 });
            await btn.click();
            await this.page.waitForTimeout(62000); // 1m expiry
        }
        this.isTrading = false;
    }

    async interactWithFeatures() {
        const feature = Array.from(this.controlMap.values())[Math.floor(Math.random() * this.controlMap.size)];
        try {
            await feature.hover();
            await this.page.waitForTimeout(1000);
            this.broadcast("🛡️ *Security:* Feature interaction simulated to prevent pattern detection.");
        } catch (e) {}
    }
}

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const page = (await browser.contexts()[0].pages()).find(p => p.url().includes('pocketoption')) || (await browser.contexts()[0].pages())[0];
        const bot = new OmniAwareAI(page);
        await bot.run();
    } catch (e) {
        console.error("❌ CONNECTION FAILED: Open Chrome on port 9222.");
    }
})();
