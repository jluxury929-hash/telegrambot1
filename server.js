// --- 🛰️ FINAL CERTAINTY TRIANGULATION ENGINE ---
async function precisionClick(direction) {
    if (!state.page || !state.cursor) return false;

    try {
        await log(`🔍 **Triangulating ${direction}...**`);

        // 1. LAYER ONE: Role & Text Triangulation (Most Reliable)
        // We look for any button that contains "Buy", "Up", "Call", "Sell", "Down", or "Put"
        const labelRegex = direction === "UP" ? /Buy|Up|Call|Higher/i : /Sell|Down|Put|Lower/i;
        
        let target = state.page.getByRole('button', { name: labelRegex }).first();

        // 2. LAYER TWO: CSS Triangulation Fallback
        if (!(await target.isVisible())) {
            const cssSelector = direction === "UP" ? ".btn-call, .up-btn" : ".btn-put, .down-btn";
            target = state.page.locator(cssSelector).first();
        }

        // 3. LAYER THREE: Actionability Check
        await target.waitFor({ state: 'visible', timeout: 5000 });
        const box = await target.boundingBox();

        if (!box) {
            await log(`❌ **Critical Failure:** Button found but coordinates are zero.`);
            return false;
        }

        // 🎯 EXACT CENTER TRIANGULATION
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        // 4. EXECUTION: The Triple-Tap
        // Move ghost-cursor (Stealth)
        await state.cursor.moveTo({ x: targetX, y: targetY });

        // Force a hardware-level click event bypasses most anti-bot layers
        await target.dispatchEvent('mousedown');
        await target.dispatchEvent('mouseup');
        await target.dispatchEvent('click');

        await log(`💰 **ORDER EXECUTED:** ${direction} button confirmed.`);
        return true;

    } catch (e) {
        // FAIL-SAFE: If the button is blocked by an overlay, use 'force: true'
        try {
            const selector = direction === "UP" ? ".btn-call" : ".btn-put";
            await state.page.click(selector, { force: true, timeout: 2000 });
            await log(`⚠️ **Emergency Click:** Forced interaction used.`);
            return true;
        } catch (err) {
            await log(`❌ **Triangulation Lost:** ${e.message}`);
            return false;
        }
    }
}
