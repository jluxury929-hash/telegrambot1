// bridge.js
class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
        this.isReady = false;
    }

    // Locks the browser session into memory
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        this.isReady = true;
        console.log("🔒 [BRIDGE] Session locked in memory.");
    }

    // Safely retrieves the session with a health check
    async getSafe() {
        if (!this.page || this.page.isClosed()) {
            throw new Error("BRIDGE_LOST: Browser tab was closed.");
        }
        return { page: this.page, cursor: this.cursor };
    }
}

// Export a single instance (Singleton)
module.exports = new BridgeManager();
