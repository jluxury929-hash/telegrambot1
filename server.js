require('dotenv').config();
const { chromium } = require('playwright');
const { createCursor } = require('ghost-cursor');
const axios = require('axios');

const state = {
    page: null,
    cursor: null,
    isAuto: false,
    lastTradeTime: 0
};

async function log(m) { console.log(`[LOG]: ${m}`); }

// --- 🛰️ FINAL CERTAINTY TRIANGULATION ENGINE ---
async function precisionClick(direction) {
    if (!state.page || !state.cursor) return false;
    try {
        const labelRegex = direction === "UP" ? /Buy|Up|Call|Higher/i : /Sell|Down|Put|Lower/i;
        const btn = state.page.getByRole('button', { name: labelRegex }).first();
        
        await btn.waitFor({ state: 'attached', timeout: 5000 });
        const box = await btn.boundingBox();
        if (!box) throw new Error("Coordinates lost");

        // Triangulate center of the button
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await state.cursor.moveTo({ x: targetX, y: targetY });

        // DOM Injection Click (Bypasses Canvas/Overlays)
        await btn.evaluate((el) => {
            ['mousedown', 'mouseup', 'click'].forEach(t => {
                el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
            });
        });
        await log(`💰 ORDER EXECUTED: ${direction}`);
        return true;
    } catch (e) {
        await log(`❌ Click Failed: ${e.message}`);
        return false;
    }
}

(async () => {
    log("🛡️ Launching Stealth Engine...");
    const browser = await chromium.launch({ headless: false });
    state.page = await (await browser.newContext()).newPage();
    state.cursor = createCursor(state.page);
    await state.page.goto('https://pocketoption.com/en/login/');
    log("✅ ENGINE ONLINE. Log in to start triangulation.");
})();
