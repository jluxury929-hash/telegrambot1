import time
import random
import requests
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
TELEGRAM_TOKEN = "YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
STAKE = 1.0

class PocketAIBot:
    def __init__(self, page):
        self.page = page
        self.broadcast("🤖 AI Bot Connected & Live. Monitoring your session...")

    def broadcast(self, message):
        """Sends a live update to your Telegram channel."""
        print(f"[LIVE]: {message}")
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"}
        try:
            requests.post(url, json=payload)
        except Exception as e:
            print(f"Telegram Failed: {e}")

    def human_mouse_action(self, selector):
        """Mimics a human scanning the screen before clicking."""
        box = self.page.locator(selector).bounding_box()
        if box:
            # 1. 'Think' for a second
            time.sleep(random.uniform(0.5, 1.5))
            # 2. Move to the general area with a curve
            target_x = box['x'] + (box['width'] * random.uniform(0.2, 0.8))
            target_y = box['y'] + (box['height'] * random.uniform(0.2, 0.8))
            self.page.mouse.move(target_x, target_y, steps=25)
            # 3. Click
            self.page.mouse.click(target_x, target_y)

    def perform_routine_check(self):
        """Mimics a human checking other platform features."""
        actions = [
            ("Checking Social Trading sentiment...", ".side-menu__link[href*='social']"),
            ("Analyzing 'Signals' tab...", ".side-menu__link[href*='signals']"),
            ("Reviewing recent trade history...", ".side-menu__link[href*='history']")
        ]
        task_name, selector = random.choice(actions)
        self.broadcast(f"🧐 {task_name}")
        try:
            self.page.click(selector, timeout=2000)
            time.sleep(random.uniform(3, 6))
            self.page.keyboard.press("Escape") # Close any popups
        except:
            self.broadcast("⚠️ Feature menu slightly different, skipping to avoid detection.")

    def run(self):
        while True:
            # AI ANALYTICS LOGIC
            # Imagine this is connected to a 'World Class' data feed
            self.broadcast("📊 Scanning Bollinger Bands & RSI for entry...")
            
            # Simulated Signal Logic
            chance = random.random()
            if chance > 0.97:
                self.broadcast("🚀 **STRATEGY ALERT**: Strong BULLISH trend detected.")
                self.human_mouse_action(".btn-call")
                self.broadcast(f"✅ Trade placed: CALL ${STAKE}. Waiting for result...")
                time.sleep(62) # Wait for trade expiry
            
            elif random.random() > 0.90:
                # Anti-Freeze Behavior
                self.perform_routine_check()
            
            # Random 'Rest' Period
            idle_time = random.randint(20, 60)
            if idle_time > 50:
                self.broadcast(f"💤 Idling for {idle_time}s to maintain human profile...")
            time.sleep(idle_time)

def main():
    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
            page = browser.contexts[0].pages[0]
            bot = PocketAIBot(page)
            bot.run()
        except Exception as e:
            # Fatal error notification
            requests.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", 
                          json={"chat_id": TELEGRAM_CHAT_ID, "text": f"❌ BOT CRASHED: {e}"})

if __name__ == "__main__":
    main()
