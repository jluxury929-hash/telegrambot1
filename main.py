import os
import sqlite3
import random
from google import genai
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv

# 1. SETUP
load_dotenv()
# Railway automatically provides variables to the environment
API_KEY = os.getenv("GEMINI_API_KEY")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
DB_PATH = "/data/betting_bot.db"

client = genai.Client(api_key=API_KEY)

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')
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

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    reply_keyboard = [['📈 Bet $10 HIGH', '📉 Bet $10 LOW'], ['💰 Balance']]
    await update.message.reply_text(
        "🤖 **Gemini Assistant & Betting Bot Online**\n\nI can help you bet, or you can just talk to me like a personal assistant!",
        reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True)
    )

async def handle_messages(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text
    
    # Check if user is betting
    if "Bet $10" in user_text:
        prediction = "HIGH" if "HIGH" in user_text else "LOW"
        result, status = execute_atomic_bet(10, prediction)
        if status == "SUCCESS":
            msg = f"🎰 Result: {result['num']}\n{'✅ WIN!' if result['win'] else '❌ LOSS'}\n💵 Balance: ${result['balance']:.2f}"
        else:
            msg = f"⚠️ Error: {status}"
        await update.message.reply_text(msg)
    
    elif "Balance" in user_text:
        with sqlite3.connect(DB_PATH) as conn:
            bal = conn.execute('SELECT balance FROM wallet WHERE id = 1').fetchone()[0]
        await update.message.reply_text(f"💰 Current Balance: ${bal:.2f}")

    # PERSONAL ASSISTANT MODE
    else:
        await update.message.chat.send_action("typing")
        try:
            # We tell Gemini it's a personal assistant
            response = client.models.generate_content(
                model='gemini-1.5-flash',
                contents=f"You are a helpful personal assistant. The user says: {user_text}"
            )
            await update.message.reply_text(response.text)
        except Exception as e:
            await update.message.reply_text("🤖 I'm having trouble thinking. Try again later!")

# 4. MAIN
if __name__ == "__main__":
    init_db()
    # Check for TOKEN before building
    if not TOKEN:
        print("CRITICAL ERROR: TELEGRAM_BOT_TOKEN is missing in Railway Variables!")
    else:
        app = ApplicationBuilder().token(TOKEN).build()
        app.add_handler(CommandHandler("start", start))
        app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_messages))
        print("Bot is 100% Operational.")
        app.run_polling()
