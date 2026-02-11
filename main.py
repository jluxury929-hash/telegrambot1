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

# 1. INITIALIZATION & SECURITY
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://polygon-rpc.com")))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(os.getenv("WALLET_SEED"))
DB_PATH = "/data/betting_bot.db"

AI_PERSONA = "You are a Bloomberg-level Quant Assistant. Be witty and elite."

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        if conn.execute('SELECT COUNT(*) FROM history').fetchone()[0] == 0:
            for _ in range(20): conn.execute('INSERT INTO history (num) VALUES (?)', (random.randint(1, 100),))

# 2. INSTANT MONTE CARLO (100 ITERATIONS)
def run_fast_sim(data):
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=100))
    return np.sum(sim_results > 50) / 100

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Fetch REAL Mainnet Balance
    balance_wei = w3.eth.get_balance(user_account.address)
    balance = w3.from_wei(balance_wei, 'ether')
    
    # Bottom Chat Menu (Permanent)
    bottom_menu = [['💰 Check Balance', '🚀 New Bet'], ['🕴️ Talk to Assistant']]
    reply_markup = ReplyKeyboardMarkup(bottom_menu, resize_keyboard=True)

    welcome = (f"🕴️ **Mainnet Quant Suite**\n\n"
               f"Boss, your vault is active on the blockchain.\n"
               f"💵 **REAL BALANCE:** {balance:.4f} POL/ETH\n"
               f"📥 **DEPOSIT:** `{user_account.address}`\n\n"
               f"Select your stake to begin:")
    
    # In-Chat Stake Menu
    stake_kb = [[
        InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
        InlineKeyboardButton("💵 $50", callback_data='AMT_50'),
        InlineKeyboardButton("💵 $100", callback_data='AMT_100')
    ]]

    await update.message.reply_text(welcome, parse_mode='Markdown', reply_markup=reply_markup)
    await update.message.reply_text("👇 **Choose Stake Amount:**", reply_markup=InlineKeyboardMarkup(stake_kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    if data.startswith('AMT_'):
        context.user_data['amount'] = data.split('_')[1]
        
        # Pull history and run simulation
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        prob = run_fast_sim(hist)
        
        # World-Class AI Analysis (Separate Message)
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"{AI_PERSONA} Simulation: {prob*100}%. Stake: ${context.user_data['amount']}. Provide a world-class 1-sentence market verdict."
        )
        await query.message.reply_text(f"🕴️ **Quant Verdict:** {response.text}")

        # HIGHER/LOWER Buttons in Chat
        kb = [[InlineKeyboardButton("📈 HIGHER", callback_data='PRED_HIGH'),
               InlineKeyboardButton("📉 LOWER", callback_data='PRED_LOW')],
              [InlineKeyboardButton("⬅️ Change Amount", callback_data='BACK')]]
        
        await query.edit_message_text(
            f"🎯 **Stake:** ${context.user_data['amount']}\n"
            f"📊 **Sim Probability:** {prob*100:.1f}% HIGH\n\n"
            "Will you follow the simulation?",
            reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown'
        )

    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        
        # ATOMIC MAINNET CHECK: No money = No bet
        balance_wei = w3.eth.get_balance(user_account.address)
        if balance_wei == 0:
            await query.edit_message_text("❌ **Atomic Rollback:** Zero funds on Mainnet. Deposit to continue.")
            return

        # Instant Result Execution
        result_num = random.randint(1, 100)
        win = (prediction == "HIGH" and result_num > 50) or (prediction == "LOW" and result_num <= 50)
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute('INSERT INTO history (num) VALUES (?)', (result_num,))
        
        report = (f"🎲 **Result:** {result_num}\n"
                  f"{f'✅ MAINNET WIN' if win else '❌ MAINNET LOSS'}\n\n"
                  f"Calculated. Ready for the next play?")
        
        await query.edit_message_text(report, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔄 New Bet", callback_data='BACK')]]))

    elif data == 'BACK':
        kb = [[InlineKeyboardButton("💵 $10", callback_data='AMT_10'), InlineKeyboardButton("💵 $50", callback_data='AMT_50'), InlineKeyboardButton("💵 $100", callback_data='AMT_100')]]
        await query.edit_message_text("👇 **Select Amount:**", reply_markup=InlineKeyboardMarkup(kb))

async def handle_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    if text == '💰 Check Balance':
        balance_wei = w3.eth.get_balance(user_account.address)
        balance = w3.from_wei(balance_wei, 'ether')
        await update.message.reply_text(f"💵 **Vault Balance:** {balance:.4f} POL/ETH")
    elif text == '🚀 New Bet':
        await start(update, context)
    else:
        # PERSONAL ASSISTANT CHAT
        await update.message.chat.send_action("typing")
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"{AI_PERSONA} User says: {text}"
        )
        await update.message.reply_text(f"🕴️: {response.text}")

if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_chat))
    app.run_polling()
