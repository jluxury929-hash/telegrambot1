// launcher.js
require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge'); // Import our new bridge

puppeteer.use(StealthPlugin());

async function start() {
    console.log("🚀 Starting Stealth Engine...");
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [`--load-extension=${path.join(process.cwd(), 'pocket-ext')}`, '--start-maximized']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    console.log("🔑 Please login manually. Bot is waiting...");

    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });

    // Inject the internal click function
    await page.evaluate(() => {
        window.humanClick = (action) => {
            const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
            if (btn) { btn.click(); return "OK"; }
            return "ERR";
        };
    });

    // LOCK THE BRIDGE
    bridge.init(page, cursor);
    
    console.log("✅ Bridge is Secure. Launching Bot...");
    require('./bot.js'); 
}

start().catch(e => console.error("Launcher Error:", e));
