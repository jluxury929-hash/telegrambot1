// bridge.js
class BridgeManager {
    constructor() { this.page = null; this.cursor = null; this.isAuto = false; }
    init(page, cursor) { this.page = page; this.cursor = cursor; }
    get() {
        if (!this.page || this.page.isClosed()) throw new Error("BRIDGE_NOT_FOUND: Use /start to launch.");
        return { page: this.page, cursor: this.cursor };
    }
}
module.exports = new BridgeManager();
