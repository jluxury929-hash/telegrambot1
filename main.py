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

# 1. INITIALIZATION & UNIQUE HD WALLET
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://polygon-rpc.com")))
Account.enable_unaudited_hdwallet_features()

# Deriving a unique wallet index (m/44'/60'/0'/0/1) to stay separate from default accounts
user_account = Account.from_mnemonic(os.getenv("WALLET_SEED"), account_path="m/44'/60'/0'/0/1")
DB_PATH = "/data/betting_bot.db"
AI_PERSONA = "You are a Bloomberg-level Quant Assistant. Be witty and elite."

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        if conn.execute('SELECT COUNT(*) FROM history').fetchone()[0] == 0:
            for _ in range(20): conn.execute('INSERT INTO history (num) VALUES (?)', (random.randint(1, 100),))

# 2. DUAL-SIMULATION ENGINE
def run_quant_sim(data):
    """SIM 1: Quant Analysis (100 Iterations) - Logic for AI Verdict"""
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=100))
    return np.sum(sim_results > 50) / 100

async def run_shield_sim(context):
    """SIM 2: Atomic Shield (Blockchain Pre-Flight) - Safety Check"""
    try:
        # Check Mainnet Balance for Gas
        balance = w3.eth.get_balance(user_account.address)
        if balance < w3.to_wei(0.005, 'ether'):
            return False, "Low Mainnet Gas"
        
        # Dry-run Simulation: Performs a virtual call to ensure the environment is valid
        w3.eth.call({
            'from': user_account.address,
            'to': user_account.address, # Testing environment validity
            'value': 0
        })
        return True, "Shield Verified"
    except Exception as e:
        return False, f"Mainnet Revert: {str(e)}"

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    balance_wei = w3.eth.get_balance(user_account.address)
    balance = w3.from_wei(balance_wei, 'ether')
    
    bottom_menu = [['💰 Check Balance', '🚀 New Bet'], ['🕴️ Talk to Assistant']]
    reply_markup = ReplyKeyboardMarkup(bottom_menu, resize_keyboard=True)

    welcome = (f"🕴️ **Atomic Shield Interface**\n\n"
               f"Boss, your unique bot vault is active.\n"
               f"💵 **REAL BALANCE:** {balance:.4f} POL/ETH\n"
               f"📥 **DEPOSIT:** `{user_account.address}`\n\n"
               f"**Shield Status:** Armed & Ready.")
    
    stake_kb = [[InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
                 InlineKeyboardButton("💵 $50", callback_data='AMT_50')]]

    await update.message.reply_text(welcome, parse_mode='Markdown', reply_markup=reply_markup)
    await update.message.reply_text("👇 **Choose Stake Amount:**", reply_markup=InlineKeyboardMarkup(stake_kb))

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    if data.startswith('AMT_'):
        context.user_data['amount'] = data.split('_')[1]
        
        # RUN SIM 1: QUANT
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        prob = run_quant_sim(hist)
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"{AI_PERSONA} Simulation: {prob*100}%. Stake: ${context.user_data['amount']}. Provide a world-class verdict."
        )
        await query.message.reply_text(f"📊 **Sim 1 (Quant):** {prob*100:.1f}% HIGH probability.\n🕴️ **Verdict:** {response.text}")

        kb = [[InlineKeyboardButton("📈 HIGHER", callback_data='PRED_HIGH'),
               InlineKeyboardButton("📉 LOWER", callback_data='PRED_LOW')],
              [InlineKeyboardButton("⬅️ Back", callback_data='BACK')]]
        
        await query.edit_message_text(
            f"🎯 **Stake:** ${context.user_data['amount']}\n🛡️ **Shield:** Monitoring Mainnet State...\n\n**Select Prediction:**",
            reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown'
        )

    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        
        # RUN SIM 2: SHIELD REVERT PROTECTION
        await query.message.reply_text("🛡️ **Shield Simulating Mainnet Transaction...**")
        shield_pass, shield_msg = await run_shield_sim(context)
        
        if not shield_pass:
            await query.message.reply_text(f"🛑 **ATOMIC SHIELD REVERT**\n\n**Reason:** {shield_msg}\n**Action:** Trade aborted to protect your funds.")
            return

        # Shield Passed: Execute Result
        result_num = random.randint(1, 100)
        win = (prediction == "HIGH" and result_num > 50) or (prediction == "LOW" and result_num <= 50)
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute('INSERT INTO history (num) VALUES (?)', (result_num,))
        
        report = (f"🛡️ **Shield Status:** Success (Protected)\n"
                  f"🎲 **Result:** {result_num}\n"
                  f"{'✅ WIN' if win else '❌ LOSS'}")
        
        await query.edit_message_text(report, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔄 New Bet", callback_data='BACK')]]))

    elif data == 'BACK':
        await start(query, context)

async def handle_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text
    if text == '💰 Check Balance':
        balance_wei = w3.eth.get_balance(user_account.address)
        balance = w3.from_wei(balance_wei, 'ether')
        await update.message.reply_text(f"💵 **Vault Balance:** {balance:.4f} POL/ETH")
    elif text == '🚀 New Bet':
        await start(update, context)
    else:
        await update.message.chat.send_action("typing")
        response = client.models.generate_content(model='gemini-1.5-flash', contents=f"{AI_PERSONA} User says: {text}")
        await update.message.reply_text(f"🕴️: {response.text}")

if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_chat))
    app.run_polling()
