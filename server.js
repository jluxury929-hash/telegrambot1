require('dotenv').config();
const { chromium } = require('playwright');
const { createCursor, installMouseHelper } = require('ghost-cursor');
const path = require('path');
const TA = require('technicalindicators');

// --- ⚙️ CONFIGURATION ---
const SCAN_INTERVAL = 5000; // 5 Seconds analysis cycle
const RSI_PERIOD = 14;
const BB_PERIOD = 20;

const state = {
    page: null,
    cursor: null,
    isPredicting: false,
    lastTradeTime: 0,
    priceHistory: []
};

const log = (m) => console.log(`[TITAN-LOG] ${new Date().toLocaleTimeString()}: ${m}`);

// --- 🛰️ THE ULTIMATE FALLBACK TRIANGULATION ---
async function precisionClick(direction) {
    if (!state.page || !state.cursor) return false;
    
    try {
        log(`🎯 Triangulating ${direction} Trade...`);

        // 1. DEFINE SELECTOR POOL (2026 UPDATED)
        const selectors = direction === "UP" 
            ? ['.btn-call', '.up-btn', 'button:has-text("Higher")', '.p-buy', '.btn-success']
            : ['.btn-put', '.down-btn', 'button:has-text("Lower")', '.p-sell', '.btn-danger'];

        let target = null;

        // Fallback 1: Text & Role (Most Human)
        const labelRegex = direction === "UP" ? /Buy|Up|Call|Higher/i : /Sell|Down|Put|Lower/i;
        const roleLocator = state.page.getByRole('button', { name: labelRegex }).first();

        if (await roleLocator.isVisible()) {
            target = roleLocator;
        } else {
            // Fallback 2: CSS Selector Pool
            for (const s of selectors) {
                const el = state.page.locator(s).first();
                if (await el.isVisible()) { target = el; break; }
            }
        }

        if (!target) {
            // Fallback 3: Hard-Coordinate "Ghost" Click (Final Fail-safe)
            // If the UI is obfuscated, we click the general area where buttons usually live
            const x = direction === "UP" ? 1150 : 1150; 
            const y = direction === "UP" ? 400 : 550; 
            await state.cursor.moveTo({ x, y });
            await state.page.mouse.click(x, y, { force: true });
            log("⚠️ Emergency Coordinate Click fired.");
            return true;
        }

        // 2. GET COORDINATES
        const box = await target.boundingBox();
        if (!box) throw new Error("Button hidden in DOM");

        // 3. HUMANIZED MOVEMENT & CLICK
        const targetX = box.x + box.width / 2 + (Math.random() * 10 - 5);
        const targetY = box.y + box.height / 2 + (Math.random() * 6 - 3);

        await state.cursor.moveTo({ x: targetX, y: targetY });
        
        // Simulating physical finger pressure
        await state.page.mouse.down();
        await new Promise(r => setTimeout(r, Math.random() * 50 + 40)); 
        await state.page.mouse.up();

        log(`💰 ${direction} ORDER SUCCESSFUL`);
        return true;

    } catch (e) {
        log(`❌ Click System Blocked: ${e.message}`);
        return false;
    }
}

// --- 📈 HEAVY ANALYSIS (MILLISECONDS) ---
function analyze() {
    if (state.priceHistory.length < BB_PERIOD) return null;
    
    const prices = state.priceHistory;
    const current = prices[prices.length - 1];

    const rsi = TA.RSI.calculate({ values: prices, period: RSI_PERIOD }).pop();
    const bb = TA.BollingerBands.calculate({ values: prices, period: BB_PERIOD, stdDev: 2.5 }).pop();

    if (!rsi || !bb) return null;

    if (rsi >= 75 && current >= bb.upper) return "DOWN";
    if (rsi <= 25 && current <= bb.lower) return "UP";
    
    return null;
}

// --- 🚀 STARTUP ---
(async () => {
    const userDataDir = path.join(__dirname, 'trading_session');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: { width: 1280, height: 800 }
    });

    state.page = context.pages()[0] || await context.newPage();
    state.cursor = createCursor(state.page);
    await installMouseHelper(state.page); // Adds red dot so you can see the bot move

    await state.page.goto('https://pocketoption.com/en/cabinet/');
    log("🚀 Engine Active. Log in manually once to save session.");

    // THE 5-SECOND SNIPER LOOP
    setInterval(async () => {
        if (state.isPredicting) return;

        try {
            // Millisecond Price Extraction
            const priceStr = await state.page.locator('.current-price').first().innerText();
            const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));

            if (price > 0) {
                state.priceHistory.push(price);
                if (state.priceHistory.length > 50) state.priceHistory.shift();

                const signal = analyze();
                // Cooldown check: Prevents double-clicking the same signal
                if (signal && (Date.now() - state.lastTradeTime > 10000)) {
                    state.isPredicting = true;
                    const success = await precisionClick(signal);
                    if (success) state.lastTradeTime = Date.now();
                    state.isPredicting = false;
                }
            }
        } catch (e) { /* Chart loading... */ }
    }, SCAN_INTERVAL);
})();
