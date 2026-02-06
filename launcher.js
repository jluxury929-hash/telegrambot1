const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { createCursor } = require('ghost-cursor');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function startHumanSession() {
    console.log("🕵️ Starting Humanized Stealth Session...");
    
    const browser = await puppeteer.launch({
        headless: false, // 2026 Rule: Never use headless mode for brokers
        args: [
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--start-maximized'
        ]
    });

    const page = await browser.newPage();
    const cursor = createCursor(page); // Injects natural mouse movement curves

    // Set a realistic high-end User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🕒 PLEASE LOGIN MANUALLY. I will wait for you...");

    // Wait until dashboard is reached
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });

    // Add a human delay after login (3-5 seconds of 'looking' at the page)
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));

    const cookies = await page.cookies();
    const ssidCookie = cookies.find(c => c.name === 'SSID');

    if (ssidCookie) {
        console.log("✅ SSID Secured via Human Session!");
        process.env.POCKET_OPTION_SSID = ssidCookie.value;
        
        // Don't close immediately (looks like a crash)
        await cursor.moveTo({ x: 500, y: 500 });
        await browser.close();

        // Pass control to the bot
        require('./bot.js'); 
    }
}

startHumanSession();
