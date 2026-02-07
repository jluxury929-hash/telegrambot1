import time
import random
import requests
import numpy as np
from playwright.sync_api import sync_playwright

# --- CONFIGURATION ---
TELEGRAM_TOKEN = "YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
MAX_DAILY_LOSS = 50.0  # Stop for the day if down $50
TARGET_PROFIT = 100.0  # Stop if up $100
STAKE = 1.0            # Amount per trade

# SELECTORS (These vary; use 'Inspect' in Chrome to verify current IDs)
BTN_CALL = ".btn-call"    # The 'Higher' button
BTN_PUT = ".btn-put"      # The 'Lower' button
BTN_SIGNALS = ".side-menu__link[href*='signals']"
BTN_TIMEFRAME = ".chart-period"

class HumanBot:
    def __init__(self, page):
        self.page = page
        self.daily_pnl = 0

    def send_log(self, message):
        print(f"[LOG]: {message}")
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage?chat_id={TELEGRAM_CHAT_ID}&text={message}"
        try: requests.get(url) 
        except: pass

    def human_move(self, x, y):
        """Moves mouse in a non-linear, shaky path (Bezier Curve)"""
        current_x, current_y = 0, 0 # Simplified start
        steps = random.randint(15, 35)
        for i in range(steps):
            # Add 'jitter' to the path
            jx = x + random.uniform(-2, 2)
            jy = y + random.uniform(-2, 2)
            self.page.mouse.move(jx, jy)
            time.sleep(random.uniform(0.01, 0.03))

    def interact_with_feature(self):
        """Randomly uses platform features to avoid 'Trading Only' patterns"""
        features = ["check_signals", "change_zoom", "switch_timeframe", "idle"]
        choice = random.choice(features)
        
        if choice == "check_signals":
            self.send_log("Checking platform signals for 'human' activity...")
            self.page.click(BTN_SIGNALS)
            time.sleep(random.uniform(3, 7))
        elif choice == "change_zoom":
            for _ in range(random.randint(1, 3)):
                self.page.keyboard.press("Control++" if random.random() > 0.5 else "Control+-")
        elif choice == "switch_timeframe":
            self.page.click(BTN_TIMEFRAME)
            time.sleep(random.uniform(1, 2))
            
    def execute_trade(self, direction):
        selector = BTN_CALL if direction == "UP" else BTN_PUT
        box = self.page.locator(selector).bounding_box()
        if box:
            # Click a random spot on the button, not the center
            tx = box['x'] + (box['width'] * random.uniform(0.1, 0.9))
            ty = box['y'] + (box['height'] * random.uniform(0.1, 0.9))
            self.human_move(tx, ty)
            self.page.mouse.click(tx, ty)
            self.send_log(f"Executed {direction} trade at ${STAKE}")

    def run_24_7_logic(self):
        self.send_log("AI System Online. Monitoring Market Data...")
        
        while -MAX_DAILY_LOSS < self.daily_pnl < TARGET_PROFIT:
            # ANALYTICS PLACEHOLDER
            # In a real setup, pull RSI/MACD here via JS or API
            # For this demo, we simulate a 'High Probability' signal
            signal = "UP" if random.random() > 0.98 else "NONE"
            
            if signal != "NONE":
                self.execute_trade(signal)
                time.sleep(65) # Wait for 1m candle to close
                # Update daily_pnl logic here based on balance change
            
            # Anti-Freeze Behavior
            if random.random() > 0.90:
                self.interact_with_feature()
            
            # Random 'rest' to look like a person getting coffee
            time.sleep(random.randint(10, 45))

def main():
    with sync_playwright() as p:
        # Connect to your MANUAL login session
        browser = p.chromium.connect_over_cdp("http://localhost:9222")
        context = browser.contexts[0]
        page = context.pages[0]
        
        bot = HumanBot(page)
        bot.run_24_7_logic()

if __name__ == "__main__":
    main()
