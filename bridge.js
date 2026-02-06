// bridge.js
class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
    }

    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 [BRIDGE] Instance initialized and locked.");
    }

    // This is the function the bot is looking for
    get() {
        if (!this.page) {
            throw new Error("BRIDGE_NOT_FOUND: The browser hasn't started yet.");
        }
        return { page: this.page, cursor: this.cursor };
    }
}

// CRITICAL: You must export 'new BridgeManager()' NOT just 'BridgeManager'
module.exports = new BridgeManager();
