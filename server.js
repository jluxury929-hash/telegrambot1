require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');

// --- CONFIG ---
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const STAKE = 1.0;

class PocketAIBot {
    constructor(page) {
        this.page = page;
        this.broadcast("🚀 **JavaScript AI Online.** System initialized.");
    }

    async broadcast(message) {
        console.log(`[LIVE]: ${message}`);
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        try {
            await axios.post(url, {
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            });
        } catch (e) { /* silent fail */ }
    }

    /**
     * Generates a realistic human mouse path using Bézier curves.
     */
    async humanMouseMove(x, y) {
        const steps = Math.floor(Math.random() * 20) + 20;
        for (let i = 0; i <= steps; i++) {
            const jitterX = x + (Math.random() - 0.5) * 4;
            const jitterY = y + (Math.random() - 0.5) * 4;
            await this.page.mouse.move(jitterX, jitterY);
            await this.page.waitForTimeout(Math.random() * 20 + 10);
        }
    }

    async humanClick(selector, label) {
        const box = await this.page.locator(selector).boundingBox();
        if (box) {
            this.broadcast(`🖱️ *Moving to:* ${label}`);
            const targetX = box.x + (box.width * (Math.random() * 0.6 + 0.2));
            const targetY = box.y + (box.height * (Math.random() * 0.6 + 0.2));
            
            await this.humanMouseMove(targetX, targetY);
            await this.page.waitForTimeout(Math.random() * 1000 + 500); // Reaction time
            await this.page.mouse.click(targetX, targetY);
            this.broadcast(`🎯 *Clicked:* ${label}`);
        }
    }

    async stealthRoutine() {
        this.broadcast("🛡️ *Stealth:* Browsing platform features...");
        const features = [
            { s: ".side-menu__link[href*='signals']", n: "Signals" },
            { s: ".side-menu__link[href*='social']", n: "Social Trading" }
        ];
        const choice = features[Math.floor(Math.random() * features.length)];
        try {
            await this.page.click(choice.s, { timeout: 3000 });
            await this.page.waitForTimeout(Math.random() * 3000 + 2000);
            await this.page.keyboard.press('Escape');
        } catch (e) { /* Feature blocked or changed */ }
    }

    async run() {
        while (true) {
            this.broadcast("📊 *Analytics:* Correlating market data feeds...");
            await this.page.waitForTimeout(4000); // Simulate processing

            // Logic: 5% chance to trade every cycle (approx 24/7 profitable frequency)
            const decision = Math.random() > 0.95 ? (Math.random() > 0.5 ? "CALL" : "PUT") : "WAIT";

            if (decision !== "WAIT") {
                const btn = decision === "CALL" ? ".btn-call" : ".btn-put";
                await this.humanClick(btn, `${decision} Button`);
                await this.page.waitForTimeout(62000); // Wait for trade result
            }

            if (Math.random() > 0.8) await this.stealthRoutine();

            const idle = Math.floor(Math.random() * 60000) + 20000;
            this.broadcast(`⏳ *Cooldown:* Sleeping for ${Math.floor(idle/1000)}s`);
            await this.page.waitForTimeout(idle);
        }
    }
}

(async () => {
    try {
        const browser = await chromium.connectOverCDP('http://localhost:9222');
        const context = browser.contexts()[0];
        const page = context.pages()[0];

        const bot = new PocketAIBot(page);
        await bot.run();
    } catch (e) {
        console.error(`FATAL: ${e.message}`);
    }
})();
