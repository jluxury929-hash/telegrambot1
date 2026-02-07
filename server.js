// --- 🛰️ PRECISION TRIANGULATION ENGINE ---
async function precisionClick(direction) {
    if (!state.page || !state.cursor) return;

    try {
        // 1. SELECTOR TRIANGULATION
        // We look for multiple possible selectors used by Pocket Option (2025/2026 updates)
        const selectors = direction === "UP" 
            ? ['.btn-call', '.up', 'button:has-text("Higher")', '.p-buy'] 
            : ['.btn-put', '.down', 'button:has-text("Lower")', '.p-sell'];

        let targetHandle = null;
        for (const selector of selectors) {
            targetHandle = await state.page.$(selector);
            if (targetHandle) break;
        }

        if (!targetHandle) {
            await log(`⚠️ **Target Loss:** Could not triangulate ${direction} button.`);
            return false;
        }

        // 2. COORDINATE TRIANGULATION
        // We get the exact bounding box of the button on the current viewport
        const box = await targetHandle.boundingBox();
        if (!box) return false;

        // Triangulate a random point within the center 40% of the button to avoid edge-detection
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const targetX = centerX + (Math.random() * (box.width * 0.4) - (box.width * 0.2));
        const targetY = centerY + (Math.random() * (box.height * 0.4) - (box.height * 0.2));

        await log(`🎯 **Triangulated ${direction}:** [X: ${Math.round(targetX)}, Y: ${Math.round(targetY)}]`);

        // 3. GHOST-CURSOR MOVEMENT
        // Moves in a non-linear Bezier curve to the target
        await state.cursor.moveTo({ x: targetX, y: targetY });

        // 4. HUMANIZED CLICK INJECTION
        await state.page.mouse.down();
        await new Promise(r => setTimeout(r, Math.random() * 50 + 30)); // Delay for physical click simulation
        await state.page.mouse.up();

        await log(`💰 **ORDER PLACED:** ${direction} button successfully triggered.`);
        return true;

    } catch (e) {
        await log(`❌ **Execution Error:** ${e.message}`);
        return false;
    }
}

// --- 🤖 UPDATED AUTO-PILOT LOOP ---
async function sniperLoop() {
    if (!state.isAuto || !state.page || state.isPredicting) return;
    
    const intel = await analyze();
    
    // Only trade if signal is strong and we haven't traded in the last 60s
    if (intel.signal !== "NEUTRAL" && (Date.now() - state.lastTradeTime > 60000)) {
        state.isPredicting = true;
        
        // Execute the triangulated click
        const success = await precisionClick(intel.signal);
        
        if (success) {
            state.lastTradeTime = Date.now();
        }
        
        state.isPredicting = false;
    }
    
    // Scan every 3 seconds for millisecond opportunities
    setTimeout(sniperLoop, 3000); 
}
