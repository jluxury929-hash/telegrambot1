require('dotenv').config();
const { chromium } = require('playwright');
const robot = require('robotjs');
const axios = require('axios');
const { exec } = require('child_process');

const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

class TitanIntelligenceAI {
    constructor(page) {
        this.page = page;
        this.priceHistory = [];
        this.isTrading = false;
        this.yOffset = 85; // Offset for Chrome address bar on Mac
    }

    async broadcast(msg) {
        console.log(`[TITAN-AI]: ${msg}`);
        if (!TELEGRAM_TOKEN) return;
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'Markdown'
            });
        } catch (e) { }
    }

    // --- STEP 1: SIGNAL BACKGROUND ANALYSIS ---
    // Scans the platform's internal AI recommendation box and Sentiment bar
    async analyzeBackgroundSignals() {
        try {
            // 1. Get Platform AI Signal (Enabled via Settings > AI Trading)
            const aiSignalEl = this.page.locator('.ai-recommendation-value').first();
            const aiText = await aiSignalEl.isVisible() ? (await aiSignalEl.innerText()).toLowerCase() : "";

            // 2. Get Social Sentiment (The Red/Green bar showing what others are doing)
            const sentimentBuy = await this.page.locator('.social-sentiment__value--buy').innerText().catch(() => "50%");
            const buyPercent = parseInt(sentimentBuy.replace('%', ''));

            let signal = null;
            if (aiText.includes('strong buy') || (aiText.includes('buy') && buyPercent > 65)) signal = 'CALL';
            if (aiText.includes('strong sell') || (aiText.includes('sell') && buyPercent < 35)) signal = 'PUT';

            return signal;
        } catch (e) { return null; }
    }

    // --- STEP 2: PHYSICAL EXECUTION ---
    async physicalExecution(dir) {
        this.isTrading = true;
        const selector = dir === 'CALL' ? '.btn-call' : '.btn-put';
        const btn = this.page.locator(selector).first();
        const box = await btn.boundingBox();

        if (box) {
            const screen = robot.getScreenSize();
            const viewport = await this.page.viewportSize();
            const scale = screen.width / viewport.width;

            const x = (box.x + box.width / 2) * scale;
            const y = (box.y + box.height / 2 + this.yOffset) * scale;

            this.broadcast(`🚀 **CONFLUENCE SIGNAL:** AI + Sentiment + RSI align. Executing ${dir}.`);
            
            robot.moveMouseSmooth(x, y);
            robot.mouseClick();
            
            // Backup Hotkey (Shift + W/S)
            robot.keyTap(dir === 'CALL' ? 'w' : 's', 'shift');
            await this.page.waitForTimeout(62000); 
        }
        this.isTrading = false;
    }

    calculateRSI(prices) {
        if (prices.length < 14) return 50;
        let gains = 0, losses = 0;
        for (let i = prices.length - 14; i < prices.length; i++) {
            let diff = prices[i] - prices[i-1];
            diff >= 0 ? gains += diff : losses -= diff;
        }
        return 100 - (100 / (1 + (gains / (losses || 1))));
    }

    async run() {
        this.broadcast("🏆 **Titan Background Analysis Engaged.** Monitoring all profitable nodes.");
        
        while (true) {
            try {
                const priceStr = await this.page.locator('.current-price').innerText();
                const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

                if (price > 0) {
                    this.priceHistory.push(price);
                    if (this.priceHistory.length > 50) this.priceHistory.shift();

                    const rsi = this.calculateRSI(this.priceHistory);
                    const backgroundSignal = await this.analyzeBackgroundSignals();

                    console.log(`[SCAN] RSI: ${rsi.toFixed(1)} | AI Signal: ${backgroundSignal || 'None'}`);

                    // --- THE GOLDEN DECISION ---
                    if (!this.isTrading && backgroundSignal) {
                        // High Probability: Signal matches RSI Extreme
                        if (backgroundSignal === 'CALL' && rsi <= 30) await this.physicalExecution('CALL');
                        if (backgroundSignal === 'PUT' && rsi >= 70) await this.physicalExecution('PUT');
                    }
                }
            } catch (err) { }
            await this.page.waitForTimeout(1000);
        }
    }
}

// --- BOOTSTRAP ---
(async () => {
    const chrome = `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`;
    const flags = `--remote-debugging-port=9222 --user-data-dir="${process.env.HOME}/ChromeBotProfile"`;
    exec(`${chrome} ${flags}`);
    await new Promise(r => setTimeout(r, 6000));

    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages().find(p => p.url().includes('pocketoption')) || context.pages()[0];

        const bot = new TitanIntelligenceAI(page);
        await bot.run();
    } catch (e) {
        console.error("❌ Fatal Connection Error. Check Chrome & Mac Permissions.");
    }
})();
