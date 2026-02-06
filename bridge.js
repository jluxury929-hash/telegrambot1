// bridge.js
class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
    }
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 [BRIDGE] Instance locked into memory.");
    }
    get() {
        if (!this.page) throw new Error("BRIDGE_NOT_FOUND: Use /start to launch browser first.");
        return { page: this.page, cursor: this.cursor };
    }
}
module.exports = new BridgeManager();
