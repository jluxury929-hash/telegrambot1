// bridge.js - Ensures the browser stays alive across all files
class BridgeManager {
    constructor() { this.page = null; this.cursor = null; this.isAuto = false; }
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 [BRIDGE] Engine linked to memory.");
    }
    get() {
        if (!this.page || this.page.isClosed()) throw new Error("BRIDGE_LOST: Use /start in Telegram.");
        return { page: this.page, cursor: this.cursor };
    }
}
module.exports = new BridgeManager();
