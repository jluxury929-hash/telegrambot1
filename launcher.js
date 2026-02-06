// launcher.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge');

puppeteer.use(StealthPlugin());

async function start() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [`--load-extension=${path.join(process.cwd(), 'pocket-ext')}`, '--start-maximized']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    // --- RE-INJECTION ENGINE ---
    const injectLogic = async () => {
        await page.evaluate(() => {
            window.humanClick = (action) => {
                const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
                if (btn) { btn.click(); return "OK"; }
                return "BTN_MISSING";
            };
        });
        console.log("💉 [BRIDGE] Logic Injected/Restored.");
    };

    // Auto-reinject if page navigates or reloads
    page.on('framenavigated', () => injectLogic());

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    console.log("🔑 Please login manually...");

    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
    
    await injectLogic();
    bridge.init(page, cursor);
    
    console.log("✅ [BRIDGE] Secure & Persistent.");
    require('./bot.js'); 
}

start();
