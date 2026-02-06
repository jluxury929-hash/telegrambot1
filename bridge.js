// bridge.js
class Bridge {
    constructor() {
        this.page = null;
        this.cursor = null;
    }
    init(page, cursor) {
        this.page = page;
        this.cursor = cursor;
        console.log("🔒 Bridge Instance Locked & Loaded.");
    }
    get() {
        if (!this.page) throw new Error("BRIDGE_NOT_FOUND: Browser not ready.");
        return { page: this.page, cursor: this.cursor };
    }
}
module.exports = new Bridge(); // Export as a single instance
