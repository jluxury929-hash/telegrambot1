const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');

puppeteer.use(StealthPlugin());

async function startGhostBridge() {
    console.log("🛡️ Initializing Ghost-Stealth Bridge 2026...");
    const browser = await puppeteer.launch({
        headless: false, // MANDATORY: Headless mode = Instant Ban
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
    });

    const page = (await browser.pages())[0];
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log("🌐 Loading Pocket Option...");
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🔑 LOGIN MANUALLY. Bot will auto-detect the Cabinet...");
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });
    console.log("✅ Bridge Active. Remote Control Engaged.");

    // Inject the "Human" click logic into the tab
    await page.evaluate(() => {
        window.humanTrade = (action) => {
            const btn = document.querySelector(action === 'call' ? '.btn-call' : '.btn-put');
            if (btn) {
                const event = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
                btn.dispatchEvent(event);
                return "SUCCESS";
            }
            return "UI_NOT_FOUND";
        };
    });

    global.brokerPage = page;
    global.ghostCursor = createCursor(page);

    require('./bot.js'); 
}

startGhostBridge();
