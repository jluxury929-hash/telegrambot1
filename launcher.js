// launcher.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge'); // Import our shared bridge

puppeteer.use(StealthPlugin());

async function startEngine() {
    console.log("🛡️ Starting Stealth Engine 2026...");
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [
            `--load-extension=${path.join(process.cwd(), 'pocket-ext')}`,
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    // --- AUTO-REINJECTOR ---
    // This ensures that even if the page refreshes, the bot can still click buttons.
    const injectTradeLogic = async () => {
        try {
            await page.evaluate(() => {
                window.humanClick = (action) => {
                    const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
                    if (btn) { btn.click(); return "OK"; }
                    return "NOT_FOUND";
                };
            });
            console.log("💉 [BRIDGE] Trade logic re-injected.");
        } catch (e) { /* Tab might be transitioning */ }
    };

    page.on('framenavigated', () => injectTradeLogic());

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    console.log("🔑 Please login manually. Bot is standing by...");

    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
    
    await injectTradeLogic();
    bridge.init(page, cursor);
    
    console.log("✅ [BRIDGE] Established. Launching Bot Control...");
    require('./bot.js'); // Start your Telegram bot
}

startEngine();
