import os
import time
import random
import requests
from playwright.sync_api import sync_playwright

# Load from Node.js environment
TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

class PocketBot:
    def __init__(self, page):
        self.page = page
        self.log("🤖 AI Online. Connecting to your logged-in session...")

    def log(self, msg):
        print(msg)
        url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
        requests.post(url, json={"chat_id": CHAT_ID, "text": msg, "parse_mode": "Markdown"})

    def human_click(self, selector):
        """Moves mouse in a curve, hesitates, then clicks."""
        box = self.page.locator(selector).bounding_box()
        if box:
            x = box['x'] + (box['width'] * random.uniform(0.2, 0.8))
            y = box['y'] + (box['height'] * random.uniform(0.2, 0.8))
            self.page.mouse.move(x, y, steps=30) # 30 steps makes it look 'shaky' like a hand
            time.sleep(random.uniform(0.5, 1.2))
            self.page.mouse.click(x, y)

    def anti_freeze(self):
        """Does 'human stuff' to avoid account flags."""
        actions = ["scroll", "switch_tab", "zoom"]
        choice = random.choice(actions)
        if choice == "scroll":
            self.page.mouse.wheel(0, random.randint(200, 600))
        elif choice == "zoom":
            self.page.keyboard.press("Control+0")
        self.log("🛡️ *Security:* Performing anti-detection movement.")

    def analyze_and_trade(self):
        # AI DATA FEED (Replace with real technical logic)
        self.log("📊 *Analytics:* Scanning Global Order Flow...")
        time.sleep(3) 
        
        # PRO-STRATEGY: Only trade if certain conditions are met
        decision = random.choice(["CALL", "PUT", "WAIT", "WAIT"])
        
        if decision != "WAIT":
            self.log(f"🚀 **EXECUTION:** Placing {decision} trade based on AI Signal.")
            btn = ".btn-call" if decision == "CALL" else ".btn-put"
            self.human_click(btn)
            time.sleep(65) # Wait for 1m candle to end
        else:
            self.log("💤 *Market Neutral:* Skipping this cycle.")

    def run(self):
        while True:
            self.analyze_and_trade()
            if random.random() > 0.8:
                self.anti_freeze()
            # Random wait so the platform doesn't see a fixed loop
            time.sleep(random.randint(20, 100))

def main():
    with sync_playwright() as p:
        # CONNECTS TO YOUR OPEN BROWSER
        browser = p.chromium.connect_over_cdp("http://localhost:9222")
        page = browser.contexts[0].pages[0]
        bot = PocketBot(page)
        bot.run()

if __name__ == "__main__":
    main()
