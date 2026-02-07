require('dotenv').config();
const { chromium } = require('playwright');
const { createCursor } = require('ghost-cursor');
const path = require('path');

const state = {
    page: null,
    cursor: null,
    tradeAmountSet: false,
};

const log = (m) => console.log(`[TITAN-LOG]: ${m}`);

// --- 💰 FIXED TRADE AMOUNT CONTROLLER (3 CAD) ---
async function setTradeAmountFixed() {
    if (!state.page) return;
    try {
        // Updated 2026 Selectors for the Amount Input
        const amountInput = state.page.locator('input[name="amount"], .input-amount__field, #amount-field').first();
        
        await amountInput.waitFor({ state: 'visible', timeout: 8000 });
        
        // 1. Move humanly to the input field
        const box = await amountInput.boundingBox();
        if (box) await state.cursor.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

        // 2. Clear and Set to 3
        await amountInput.click({ clickCount: 3 }); // Triple click to select all text
        await state.page.keyboard.press('Backspace');
        await amountInput.type("3", { delay: 150 }); // Types "3" like a human
        
        log("💵 Trade amount LOCKED to: $3 CAD");
        state.tradeAmountSet = true;
    } catch (e) {
        log(`⚠️ Trade Amount Sync Failed: ${e.message}`);
    }
}

// --- 🛰️ PRECISION TRIANGULATION ENGINE ---
async function precisionClick(direction) {
    if (!state.page || !state.cursor) return false;
    try {
        const labelRegex = direction === "UP" ? /Buy|Up|Call|Higher/i : /Sell|Down|Put|Lower/i;
        const btn = state.page.getByRole('button', { name: labelRegex }).first();
        
        await btn.waitFor({ state: 'attached', timeout: 5000 });
        const box = await btn.boundingBox();
        if (!box) throw new Error("Coordinates lost");

        await state.cursor.moveTo({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

        // Absolute certainty click injection
        await btn.evaluate((el) => {
            ['mousedown', 'mouseup', 'click'].forEach(t => {
                el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
            });
        });
        log(`💰 ORDER EXECUTED: ${direction} ($3 CAD)`);
        return true;
    } catch (e) {
        log(`❌ Click Failed: ${e.message}`);
        return false;
    }
}

(async () => {
    log("🛡️ Launching Stealth Engine...");
    const userDataDir = path.join(__dirname, 'trading_session');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: { width: 1280, height: 800 }
    });

    state.page = context.pages()[0] || await context.newPage();
    state.cursor = createCursor(state.page);
    
    await state.page.goto('https://pocketoption.com/en/cabinet/');
    log("✅ ENGINE ONLINE.");

    // MONITORING: Sets amount as soon as the chart is visible
    setInterval(async () => {
        const isChartVisible = await state.page.locator('.btn-call').isVisible().catch(() => false);
        if (isChartVisible && !state.tradeAmountSet) {
            await setTradeAmountFixed();
        }
    }, 5000);
})();
