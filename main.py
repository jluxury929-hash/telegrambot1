import os
import sqlite3
import random
import time
import google.generativeai as genai
from dotenv import load_dotenv

# 1. SETUP & CONFIG
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
# Store DB in /data/ to persist on Railway Volume
DB_PATH = "/data/betting_bot.db" 

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

def init_db():
    # Ensure the /data directory exists (Railway Volume)
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')

def get_pro_prediction(history):
    prompt = f"""
    You are a professional odds-maker. Based on these last numbers: {history}, 
    calculate the probability of the next number (1-100) being HIGH (51-100) or LOW (1-50).
    Return ONLY a JSON object: {{"prediction": "HIGH/LOW", "confidence": 0.XX, "reason": "short explanation"}}
    """
    try:
        response = model.generate_content(prompt)
        # Simple extraction (for production, use Pydantic/json.loads)
        return response.text
    except:
        return "AI Error: Defaulting to neutral."

def atomic_bet(amount, prediction):
    """The Atomic Transaction: Check -> Deduct -> Result -> Update"""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        try:
            # Atomic Check
            cursor.execute('SELECT balance FROM wallet WHERE id = 1')
            balance = cursor.fetchone()[0]
            
            if balance < amount:
                return "Insufficient funds."

            # Execute Bet
            new_num = random.randint(1, 100)
            is_high = new_num > 50
            win = (prediction == "HIGH" and is_high) or (prediction == "LOW" and not is_high)
            
            # Update Balance & History Atomically
            change = amount if win else -amount
            cursor.execute('UPDATE wallet SET balance = balance + ? WHERE id = 1', (change,))
            cursor.execute('INSERT INTO history (num) VALUES (?)', (new_num,))
            
            # Commit happens automatically when exiting 'with' block
            return f"Result: {new_num}. {'WIN' if win else 'LOSS'}. New Balance: {balance + change}"
        except Exception as e:
            conn.rollback() # Undo everything if a crash happens
            return f"Transaction Failed: {e}"

if __name__ == "__main__":
    init_db()
    print("Bot is live and monitoring...")
    while True:
        # 1. Get Prediction
        with sqlite3.connect(DB_PATH) as conn:
            hist = [row[0] for row in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 5').fetchall()]
        
        print(f"AI Analyzing history: {hist}")
        print(get_pro_prediction(hist))
        
        # 2. Place Atomic Bet (Sample $10 bet every 30 seconds)
        print(atomic_bet(10, "HIGH")) 
        
        time.sleep(30)
