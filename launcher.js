require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./browserManager');

puppeteer.use(StealthPlugin());

async function startGhostBridge() {
    const extensionPath = path.join(process.cwd(), 'pocket-ext');

    console.log("🛡️ Launching Stealth Browser...");
    const browser = await puppeteer.launch({
        headless: false, // 2026 Detection Rule: Headless = Ban
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--disable-blink-features=AutomationControlled',
            '--start-maximized'
        ]
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🔑 PLEASE LOGIN MANUALLY IN THE BROWSER...");
    // Wait until the dashboard URL is reached
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });

    // Inject Human UI Click logic
    await page.evaluate(() => {
        window.humanTrade = (action) => {
            const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
            if (btn) {
                btn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true }));
                return "SUCCESS";
            }
            return "UI_NOT_FOUND";
        };
    });

    bridge.setBridge(page, cursor);
    console.log("✅ Bridge Secured. Initializing Bot...");

    require('./bot.js'); 
}

startGhostBridge().catch(err => console.error("💥 Launcher Crash:", err));
