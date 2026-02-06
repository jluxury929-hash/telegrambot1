// bridge.js
class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
        this.isReady = false;
    }

    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        this.isReady = true;
        console.log("🔒 [BRIDGE] Instance Locked into memory.");
    }

    async getSafe() {
        if (!this.page || this.page.isClosed()) {
            throw new Error("BRIDGE_LOST: Browser tab was closed or not found.");
        }
        
        // Final health check: Is the tab still responsive?
        try {
            await this.page.evaluate(() => window.location.href);
        } catch (e) {
            throw new Error("BRIDGE_UNRESPONSIVE: Context destroyed (Did the page reload?)");
        }

        return { page: this.page, cursor: this.cursor };
    }
}

module.exports = new BridgeManager();
