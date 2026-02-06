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
    
    const inject = async () => {
        await page.evaluate(() => {
            window.pocket = {
                click: (dir) => {
                    const btn = document.querySelector(dir === 'up' ? '.btn-call' : '.btn-put');
                    if (btn) btn.click();
                },
                setAmount: (amt) => {
                    const inp = document.querySelector('input[name="amount"]');
                    if (inp) { inp.value = amt; inp.dispatchEvent(new Event('input', {bubbles:true})); }
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
