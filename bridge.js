class BridgeManager {
    constructor() {
        this.page = null;
        this.cursor = null;
    }
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 [BRIDGE] Session locked.");
    }
    get() {
        if (!this.page || this.page.isClosed()) throw new Error("BRIDGE_LOST: Browser is not open.");
        return { page: this.page, cursor: this.cursor };
    }
}
module.exports = new BridgeManager();
