// launcher.js
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
        args: ['--start-maximized', '--no-sandbox']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    
    const inject = async () => {
        await page.evaluate(() => {
            window.pocketHFT = (dir) => {
                const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                if (btn) {
                    btn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
                    btn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                    return "OK";
                }
            };
        });
    };

    page.on('framenavigated', inject);
    await inject();
    bridge.init(page, cursor);
    return page;
}

module.exports = { startEngine };
