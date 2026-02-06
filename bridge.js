// bridge.js
class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
    }

    // This locks the session data into memory
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 [BRIDGE] Session locked into memory.");
    }

    // This is the function your bot was missing
    get() {
        if (!this.page || this.page.isClosed()) {
            throw new Error("BRIDGE_NOT_FOUND: Browser is not open yet.");
        }
        return { page: this.page, cursor: this.cursor };
    }
}

// CRITICAL: We export an INSTANCE (new), not the Class.
module.exports = new BridgeManager();
