import os
import sqlite3
import random
from google import genai
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv

# 1. SETUP
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
DB_PATH = "/data/betting_bot.db"

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')
        # Fix: Seed history if empty so Gemini doesn't error out
        count = conn.execute('SELECT COUNT(*) FROM history').fetchone()[0]
        if count < 5:
            for _ in range(5):
                conn.execute('INSERT INTO history (num) VALUES (?)', (random.randint(1, 100),))
        conn.commit()

# 2. ATOMIC TRANSACTION ENGINE
def execute_atomic_bet(amount, prediction):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        try:
            cursor.execute('BEGIN TRANSACTION')
            cursor.execute('SELECT balance FROM wallet WHERE id = 1')
            balance = cursor.fetchone()[0]
            
            if balance < amount: return None, "INSUFFICIENT"

            new_num = random.randint(1, 100)
            is_high = new_num > 50
            win = (prediction == "HIGH" and is_high) or (prediction == "LOW" and not is_high)
            
            new_balance = balance + (amount if win else -amount)
            cursor.execute('UPDATE wallet SET balance = ? WHERE id = 1', (new_balance,))
            cursor.execute('INSERT INTO history (num) VALUES (?)', (new_num,))
            
            conn.commit()
            return {"num": new_num, "win": win, "balance": new_balance}, "SUCCESS"
        except Exception as e:
            conn.rollback()
            return None, str(e)

# 3. TELEGRAM HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    reply_keyboard = [['📈 Bet $10 HIGH', '📉 Bet $10 LOW'], ['💰 Balance']]
    await update.message.reply_text(
        "🤖 **Atomic Gemini Bot Live**\nSelect a bet below:",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True)
    )

async def handle_bet(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    prediction = "HIGH" if "HIGH" in text else "LOW"
    
    # Get history for Gemini
    with sqlite3.connect(DB_PATH) as conn:
        hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 5').fetchall()]
    
    # Professional AI Prediction
    try:
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"Sequence: {hist}. Next HIGH or LOW? Reply only with the word."
        )
        ai_suggestion = response.text.strip().upper()
    except:
        ai_suggestion = "UNKNOWN"

    # Execute
    result, status = execute_atomic_bet(10, prediction)
    
    if status == "SUCCESS":
        msg = (f"🔮 AI Suggestion: {ai_suggestion}\n"
               f"🎰 Result: {result['num']}\n"
               f"{'✅ WIN!' if result['win'] else '❌ LOSS'}\n"
               f"💵 Balance: ${result['balance']:.2f}")
    else:
        msg = f"⚠️ Error: {status}"
        
    await update.message.reply_text(msg)

# 4. MAIN
if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_bet))
    print("Bot is 100% operational...")
    app.run_polling()
