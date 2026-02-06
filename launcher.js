// launcher.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge'); // This imports the shared instance

puppeteer.use(StealthPlugin());

async function startEngine() {
    console.log("🛡️ Starting Stealth Engine 2026...");
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [`--load-extension=${path.join(process.cwd(), 'pocket-ext')}`, '--start-maximized']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    // Re-injector: Ensures the bot's "brain" stays inside the browser tab
    const injectLogic = async () => {
        try {
            await page.evaluate(() => {
                window.humanClick = (action) => {
                    const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
                    if (btn) { btn.click(); return "OK"; }
                    return "BTN_NOT_FOUND";
                };
            });
            console.log("💉 [BRIDGE] Trade logic injected.");
        } catch (e) { /* Tab transitioning */ }
    };

    page.on('framenavigated', () => injectLogic());
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🔑 Please login manually...");
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
    
    await injectLogic();
    bridge.init(page, cursor); // Hand off session to the Bridge
    
    console.log("✅ [BRIDGE] Established. Starting Telegram logic...");
    require('./bot.js'); 
}

startEngine();
