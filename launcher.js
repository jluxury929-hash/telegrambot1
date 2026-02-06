const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Use stealth to bypass bot detection
puppeteer.use(StealthPlugin());

async function runLauncher() {
    console.log("🚀 Initializing Auto-Login Workaround...");

    const browser = await puppeteer.launch({ 
        headless: false, // Must be false so you can solve CAPTCHAs
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("🌐 Navigating to Pocket Option...");
    await page.goto('https://pocketoption.com/en/login/', { waitUntil: 'networkidle2' });

    console.log("🔑 PLEASE LOGIN MANUALLY IN THE BROWSER...");
    console.log("Once you reach the trading dashboard, I will capture the SSID automatically.");

    // Wait until the URL contains 'cabinet', meaning login was successful
    await page.waitForFunction(() => window.location.href.includes('cabinet'), { timeout: 0 });

    // Grab the SSID from the browser cookies
    const cookies = await page.cookies();
    const ssidCookie = cookies.find(c => c.name === 'SSID');

    if (ssidCookie) {
        const ssidValue = ssidCookie.value;
        console.log("✅ SSID CAPTURED successfully!");

        // INJECTION: We set the environment variable for the current process
        process.env.POCKET_OPTION_SSID = ssidValue;

        await browser.close();
        console.log("🤖 LAUNCHING YOUR ORIGINAL BOT...");
        console.log("------------------------------------------");

        // This line runs your original bot.js file using the newly captured SSID
        // Replace 'bot.js' with your actual filename if it's different.
        require('./bot.js'); 

    } else {
        console.log("❌ SSID not found. Try logging in again.");
        await browser.close();
        process.exit(1);
    }
}

runLauncher().catch(err => {
    console.error("💥 Launcher Error:", err);
});
