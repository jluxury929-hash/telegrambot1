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

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        # Seed history if empty for the first simulation
        count = conn.execute('SELECT COUNT(*) FROM history').fetchone()[0]
        if count == 0:
            for _ in range(20): conn.execute('INSERT INTO history (num) VALUES (?)', (random.randint(1, 100),))

# 2. HIGH-SPEED MONTE CARLO (100 ITERATIONS)
def run_mainnet_sim(data):
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=100))
    return np.sum(sim_results > 50) / 100

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Fetch REAL Mainnet Balance
    balance_wei = w3.eth.get_balance(user_account.address)
    balance = w3.from_wei(balance_wei, 'ether')
    
    welcome = (f"🕴️ **Mainnet Assistant Bot**\n"
               f"💰 **Real Balance:** {balance:.4f} POL/ETH\n"
               f"📥 **Deposit Address:** `{user_account.address}`\n\n"
               "Choose your stake to begin:")
    
    kb = [[InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
           InlineKeyboardButton("💵 $50", callback_data='AMT_50')]]
    
    # Bottom menu for navigation
    reply_markup = ReplyKeyboardMarkup([['💰 Balance', '🚀 New Bet']], resize_keyboard=True)
    await update.message.reply_text(welcome, parse_mode='Markdown', reply_markup=reply_markup)
    await update.message.reply_text("👇 **Select Amount:**", reply_markup=InlineKeyboardMarkup(kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    if data.startswith('AMT_'):
        context.user_data['amount'] = data.split('_')[1]
        
        # ATOMIC PRE-CALCULATION: Get AI prediction BEFORE the user commits
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        
        prob = run_mainnet_sim(hist)
        
        # Fetch World's Best Analysis
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"Probability: {prob*100}%. Stake: ${context.user_data['amount']}. Provide a world-class 1-sentence analysis and a 'HIGH' or 'LOW' recommendation."
        )
        context.user_data['ai_advice'] = response.text

        kb = [[InlineKeyboardButton("📈 HIGHER", callback_data='PRED_HIGH'),
               InlineKeyboardButton("📉 LOWER", callback_data='PRED_LOW')]]
        
        # Display: Stake + AI Prediction
        await query.edit_message_text(
            f"🎯 **Stake:** ${context.user_data['amount']}\n"
            f"🧠 **AI Prediction:** {context.user_data['ai_advice']}\n\n"
            "Do you follow the AI or go your own way?",
            reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown'
        )

    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        
        # Real-time Blockchain Check (Atomic)
        balance_wei = w3.eth.get_balance(user_account.address)
        if balance_wei == 0:
            await query.edit_message_text("❌ **Transaction Aborted:** Zero balance on Mainnet. Deposit funds to continue.")
            return

        # Execute Result
        result_num = random.randint(1, 100)
        win = (prediction == "HIGH" and result_num > 50) or (prediction == "LOW" and result_num <= 50)
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute('INSERT INTO history (num) VALUES (?)', (result_num,))
        
        report = (f"🎰 **Result:** {result_num}\n"
                  f"{'✅ MAINNET WIN' if win else '❌ MAINNET LOSS'}\n\n"
                  f"🕴️ **Assistant:** That was a calculated move. Ready for the next?")
        
        await query.edit_message_text(report, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔄 New Bet", callback_data='BACK')]]))

    elif data == 'BACK':
        await start(query, context)

# 4. RUN
if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.run_polling()
