let pageInstance = null;
let cursorInstance = null;

module.exports = {
    setBridge: (page, cursor) => {
        pageInstance = page;
        cursorInstance = cursor;
    },
    getBridge: () => {
        if (!pageInstance) throw new Error("BRIDGE_LOST: Browser session not found.");
        return { page: pageInstance, cursor: cursorInstance };
    }
};
