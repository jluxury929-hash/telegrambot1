// launcher.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge');

puppeteer.use(StealthPlugin());

async function startEngine() {
    console.log("🛡️ Starting Stealth Engine...");
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        args: [`--load-extension=${path.join(process.cwd(), 'pocket-ext')}`, '--start-maximized']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    const injectLogic = async () => {
        await page.evaluate(() => {
            window.humanClick = (a) => {
                const btn = document.querySelector(a === 'call' ? '.btn-call' : '.btn-put');
                if (btn) { btn.click(); return "OK"; }
                return "ERR";
            };
        });
    };

    page.on('framenavigated', injectLogic);
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    
    // Hand over to the bridge
    bridge.init(page, cursor);
    return page;
}

module.exports = { startEngine };
