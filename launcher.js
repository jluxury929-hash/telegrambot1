const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const path = require('path');
const bridge = require('./bridge');

puppeteer.use(StealthPlugin());

async function startEngine() {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", 
        args: ['--start-maximized', '--disable-dev-shm-usage', '--no-sandbox']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);
    
    // Inject the Fast-Action Core
    const inject = async () => {
        await page.evaluate(() => {
            window.pocketHFT = {
                execute: (dir) => {
                    const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                    if (btn) {
                        // Sub-millisecond physical event dispatch
                        btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                        btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                        return "EXECUTED";
                    }
                    return "MISSING";
                }
            };
        });
    };

    page.on('framenavigated', inject);
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    await inject();
    bridge.init(page, cursor);
    return page;
}

module.exports = { startEngine };
