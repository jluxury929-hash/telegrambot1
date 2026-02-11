import os
import random
import sqlite3
import numpy as np
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. INITIALIZATION
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://polygon-rpc.com")))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(os.getenv("WALLET_SEED"))
DB_PATH = "/data/betting_bot.db"

# System instructions to keep the AI fast and professional
AI_PERSONA = "You are an elite, witty personal assistant for a crypto high-roller."

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY, balance REAL)')
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        conn.execute('INSERT OR IGNORE INTO wallet (id, balance) VALUES (1, 1000.0)')

# 2. OPTIMIZED MATH (100 Iterations for Instant Speed)
def run_fast_sim(data):
    if len(data) < 2: return 0.5
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=100))
    return np.sum(sim_results > 50) / 100

# 3. ATOMIC ENGINE
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

# 4. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    with sqlite3.connect(DB_PATH) as conn:
        balance = conn.execute('SELECT balance FROM wallet WHERE id = 1').fetchone()[0]
    
    # Bottom Chat Menu
    bottom_menu = [['💰 Balance', '🚀 New Bet'], ['🕴️ Talk to Assistant']]
    
    # In-Chat Selection
    inline_kb = [[
        InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
        InlineKeyboardButton("💵 $50", callback_data='AMT_50'),
        InlineKeyboardButton("💵 $100", callback_data='AMT_100')
    ]]

    welcome = (f"🕴️ **Assistant & Atomic Bot Live**\nVault: ${balance:.2f}\n"
               f"Deposit: `{user_account.address}`\n\nReady for a move, Boss?")
    
    await update.message.reply_text(welcome, parse_mode='Markdown', reply_markup=ReplyKeyboardMarkup(bottom_menu, resize_keyboard=True))
    await update.message.reply_text("👇 **Choose your stake:**", reply_markup=InlineKeyboardMarkup(inline_kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    if data.startswith('AMT_'):
        context.user_data['amount'] = int(data.split('_')[1])
        kb = [[InlineKeyboardButton("📈 HIGHER", callback_data='PRED_HIGH'),
               InlineKeyboardButton("📉 LOWER", callback_data='PRED_LOW')]]
        await query.edit_message_text(f"🎯 **Stake: ${context.user_data['amount']}**\nPrediction:", reply_markup=InlineKeyboardMarkup(kb))

    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        amount = context.user_data.get('amount', 10)
        
        # 1. Math & Simulation
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        prob = run_fast_sim(hist)
        
        # 2. AI Expert Verdict
        response = client.models.generate_content(
            model='gemini-1.5-flash', 
            contents=f"{AI_PERSONA} Simulation: {prob*100}%. User betting ${amount} on {prediction}. Give a lightning-fast verdict (max 1 sentence)."
        )

        # 3. Atomic Run
        result, status = execute_atomic_bet(amount, prediction)
        
        msg = (f"🕴️ **Verdict:** {response.text}\n"
               f"🎲 **Result:** {result['num']} | {'✅ WIN' if result['win'] else '❌ LOSS'}\n"
               f"💵 **Vault:** ${result['balance']:.2f}")
        
        retry_kb = [[InlineKeyboardButton("🔄 Play Again", callback_data='BACK')]]
        await query.edit_message_text(msg, reply_markup=InlineKeyboardMarkup(retry_kb), parse_mode='Markdown')

    elif data == 'BACK':
        # Re-display stake options
        kb = [[InlineKeyboardButton("💵 $10", callback_data='AMT_10'), InlineKeyboardButton("💵 $50", callback_data='AMT_50'), InlineKeyboardButton("💵 $100", callback_data='AMT_100')]]
        await query.edit_message_text("👇 **Choose Stake:**", reply_markup=InlineKeyboardMarkup(kb))

async def handle_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text
    if user_text == '💰 Balance':
        with sqlite3.connect(DB_PATH) as conn:
            bal = conn.execute('SELECT balance FROM wallet WHERE id = 1').fetchone()[0]
        await update.message.reply_text(f"💵 **Current Vault:** ${bal:.2f}")
    elif user_text == '🚀 New Bet':
        await start(update, context)
    else:
        # General Assistant AI response
        await update.message.chat.send_action("typing")
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"{AI_PERSONA} The user says: {user_text}"
        )
        await update.message.reply_text(f"🕴️: {response.text}")

# 5. RUN
if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_chat))
    app.run_polling()
