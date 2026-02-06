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
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const page = (await browser.pages())[0];
    const cursor = createCursor(page);

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });
    
    // Feature Injection: Support for automatic amount setting and time adjustment
    const inject = async () => {
        await page.evaluate(() => {
            window.pocketControl = {
                click: (a) => {
                    const btn = document.querySelector(a === 'call' ? '.btn-call' : '.btn-put');
                    if (btn) { btn.click(); return "OK"; }
                    return "BTN_NOT_FOUND";
                },
                setAmount: (val) => {
                    const input = document.querySelector('input[name="amount"]');
                    if (input) { input.value = val; return "SET"; }
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
