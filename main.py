import os
import sqlite3
import random
import time
from google import genai
from dotenv import load_dotenv

# 1. SETUP
load_dotenv()
# The new SDK automatically looks for GEMINI_API_KEY in environment variables
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
DB_PATH = "/data/betting_bot.db" 

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')

def get_pro_prediction(history):
    prompt = f"Last numbers: {history}. Predict next as HIGH (51-100) or LOW (1-50). One word only."
    try:
        # UPDATED: New SDK syntax
        response = client.models.generate_content(
            model='gemini-1.5-flash', 
            contents=prompt
        )
        return response.text.strip().upper()
    except Exception as e:
        print(f"AI Error: {e}")
        return "HIGH" # Safe fallback

def atomic_bet(amount, prediction):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT balance FROM wallet WHERE id = 1')
            balance = cursor.fetchone()[0]
            
            if balance < amount: return "Broke! Resetting..."

            new_num = random.randint(1, 100)
            is_high = new_num > 50
            win = (prediction == "HIGH" and is_high) or (prediction == "LOW" and not is_high)
            
            change = amount if win else -amount
            cursor.execute('UPDATE wallet SET balance = balance + ? WHERE id = 1', (change,))
            cursor.execute('INSERT INTO history (num) VALUES (?)', (new_num,))
            
            return f"Result: {new_num}. {'WIN' if win else 'LOSS'}. Balance: {balance + change}"
        except Exception as e:
            conn.rollback()
            return f"Error: {e}"

if __name__ == "__main__":
    init_db()
    print("Bot is live with NEW Google GenAI SDK...")
    while True:
        with sqlite3.connect(DB_PATH) as conn:
            hist = [row[0] for row in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 5').fetchall()]
        
        pred = get_pro_prediction(hist)
        print(f"Prediction: {pred} | {atomic_bet(10, pred)}")
        time.sleep(30)
