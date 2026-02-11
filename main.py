import os
import random
import sqlite3
import numpy as np
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. INITIALIZATION
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SEED = os.getenv("WALLET_SEED")
RPC = os.getenv("RPC_URL", "https://polygon-rpc.com")
DB_PATH = "/data/betting_bot.db"

client = genai.Client(api_key=API_KEY)
w3 = Web3(Web3.HTTPProvider(RPC))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(SEED)

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')

def run_simulation(data, iterations=10000):
    if len(data) < 2: return 0.5
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=iterations))
    return np.sum(sim_results > 50) / iterations

# 2. THE ATOMIC ENGINE
def execute_atomic_bet(amount, prediction):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute('BEGIN TRANSACTION')
        cursor.execute('SELECT balance FROM wallet WHERE id = 1')
        balance = cursor.fetchone()[0]
        
        if balance < amount: raise ValueError("INSUFFICIENT_FUNDS")

        res_num = random.randint(1, 100)
        win = (prediction == "HIGH" and res_num > 50) or (prediction == "LOW" and res_num <= 50)
        
        new_balance = balance + (amount if win else -amount)
        cursor.execute('UPDATE wallet SET balance = ? WHERE id = 1', (new_balance,))
        cursor.execute('INSERT INTO history (num) VALUES (?)', (res_num,))
        
        conn.commit()
        return {"num": res_num, "win": win, "balance": new_balance}, "SUCCESS"
    except Exception as e:
        conn.rollback()
        return None, str(e)
    finally:
        conn.close()

# 3. TELEGRAM HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with sqlite3.connect(DB_PATH) as conn:
        balance = conn.execute('SELECT balance FROM wallet WHERE id = 1').fetchone()[0]
    
    welcome_text = (
        f"🕴️ **VIP Atomic Assistant**\n\n"
        f"Boss, the vault is ready.\n"
        f"📥 **DEPOSIT (REAL):** `{user_account.address}`\n"
        f"💵 **VIRTUAL BALANCE:** ${balance:.2f}\n\n"
        "Select your stake to begin the simulation:"
    )
    
    keyboard = [
        [InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
         InlineKeyboardButton("💵 $50", callback_data='AMT_50'),
         InlineKeyboardButton("💵 $100", callback_data='AMT_100')],
        [InlineKeyboardButton("💰 Check Balance", callback_data='CHECK_BAL')]
    ]
    await update.message.reply_text(welcome_text, parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))

async def handle_interaction(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    if data.startswith('AMT_'):
        context.user_data['amount'] = int(data.split('_')[1])
        keyboard = [
            [InlineKeyboardButton("📈 HIGHER (51-100)", callback_data='PRED_HIGH')],
            [InlineKeyboardButton("📉 LOWER (1-50)", callback_data='PRED_LOW')],
            [InlineKeyboardButton("⬅️ Back", callback_data='BACK')]
        ]
        await query.edit_message_text(f"🎯 **Stake:** ${context.user_data['amount']}\nSelect your prediction:", 
                                     reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')

    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        amount = context.user_data.get('amount', 10)
        
        await query.edit_message_text("📊 *Assistant is running Monte Carlo simulations...*", parse_mode='Markdown')

        # 1. Fetch History & Simulate
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        
        prob_high = run_simulation(hist)
        
        # 2. AI Verdict
        response = client.models.generate_content(
            model='gemini-1.5-flash', 
            contents=f"Probability: {prob_high}. User betting ${amount} on {prediction}. Give a pro-trader verdict."
        )

        # 3. Atomic Execution
        result, status = execute_atomic_bet(amount, prediction)
        
        if status == "SUCCESS":
            msg = (f"🕴️ **Verdict:** {response.text}\n\n"
                   f"🎲 **Result:** {result['num']}\n"
                   f"{'✅ WIN!' if result['win'] else '❌ LOSS.'}\n"
                   f"💵 **Balance:** ${result['balance']:.2f}")
        else:
            msg = f"⚠️ **Atomic Rollback:** {status}. No funds moved."
        
        await query.edit_message_text(msg + "\n\nUse /start to play again.", parse_mode='Markdown')

    elif data == 'BACK':
        await start(query, context)

# 4. RUN
if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_interaction))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), lambda u, c: u.message.reply_text("🕴️: I'm here. Use /start to bet or ask me anything!")))
    app.run_polling()
