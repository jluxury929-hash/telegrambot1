const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');

puppeteer.use(StealthPlugin());

async function startGhostBridge() {
    console.log("🛡️ Initializing Ghost-Stealth Bridge...");
    
    const browser = await puppeteer.launch({
        headless: false, // MANDATORY: Headless is an instant ban in 2026.
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Use your REAL Chrome
        args: [
            '--disable-blink-features=AutomationControlled',
            '--start-maximized',
            '--no-sandbox'
        ]
    });

    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log("🌐 Loading Pocket Option...");
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🔑 LOGIN MANUALLY. The bot will wait for the dashboard.");

    // Wait for the user to be logged in and reach the "Cabinet"
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
    console.log("✅ Identity Verified. Stealth Tunnel Active.");

    // INJECT: A physical click function inside the browser tab
    await page.evaluate(() => {
        window.humanClick = (selector) => {
            const btn = document.querySelector(selector);
            if (btn) {
                const evt = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                btn.dispatchEvent(evt);
                return "SUCCESS";
            }
            return "BTN_NOT_FOUND";
        };
    });

    // Make the browser objects available to bot.js
    global.brokerPage = page;
    global.ghostCursor = createCursor(page);

    console.log("🚀 STARTING TELEGRAM BOT...");
    require('./bot.js'); 
}

startGhostBridge();
