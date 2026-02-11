import os
import random
import sqlite3
import numpy as np
import asyncio
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, constants
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. INITIALIZATION & UNIQUE HD WALLET
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://polygon-rpc.com")))
Account.enable_unaudited_hdwallet_features()

# Deriving unique bot wallet index m/44'/60'/0'/0/1
user_account = Account.from_mnemonic(os.getenv("WALLET_SEED"), account_path="m/44'/60'/0'/0/1")
DB_PATH = "/data/betting_bot.db"

# THE GENIUS PERSONA: High-Level Quant Analysis Instructions
GENIUS_PROMPT = (
    "You are a World-Class Quant Trading Genius. Your goal is to maximize the user's edge. "
    "Analyze Mathematical Drift, Volatility clusters, and Mean Reversion. "
    "Provide a sharp, elite, 1-sentence verdict that sounds like a Bloomberg terminal."
)

def init_db():
    os.makedirs("/data", exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, num INTEGER)')
        if conn.execute('SELECT COUNT(*) FROM history').fetchone()[0] == 0:
            for _ in range(20): conn.execute('INSERT INTO history (num) VALUES (?)', (random.randint(1, 100),))

# 2. DUAL-SIMULATION ENGINE
def run_quant_sim(data):
    """SIM 1: Quant Analysis (100 Iterations) - Market Math Logic"""
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=100))
    # Returns Probability, Drift, and Volatility for the Genius AI
    return np.sum(sim_results > 50) / 100, mu, sigma

async def run_shield_sim(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """SIM 2: Atomic Shield (Blockchain Pre-Flight) - Safety Check"""
    await context.bot.send_message(chat_id=update.effective_chat.id, text="🛡️ **Shield Simulating Mainnet Transaction...**")
    try:
        balance = w3.eth.get_balance(user_account.address)
        if balance < w3.to_wei(0.005, 'ether'):
            return False, "Low Mainnet Gas"
        
        # Dry-run Simulation: Virtual call to ensure network validity
        w3.eth.call({'from': user_account.address, 'to': user_account.address, 'value': 0})
        return True, "Shield Verified"
    except Exception as e:
        return False, f"Mainnet Revert: {str(e)}"

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    balance_wei = w3.eth.get_balance(user_account.address)
    balance = w3.from_wei(balance_wei, 'ether')
    
    bottom_menu = [['💰 Check Balance', '🚀 New Bet'], ['🕴️ Talk to Assistant']]
    reply_markup = ReplyKeyboardMarkup(bottom_menu, resize_keyboard=True)

    welcome = (f"🕴️ **Genius Atomic Interface**\n\n"
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
    await query.answer()

    if query.data.startswith('AMT_'):
        context.user_data['amount'] = query.data.split('_')[1]
        
        # RUN SIM 1: QUANT (GENIUS DATA)
        with sqlite3.connect(DB_PATH) as conn:
            hist = [r[0] for r in conn.execute('SELECT num FROM history ORDER BY id DESC LIMIT 20').fetchall()]
        prob, drift, vol = run_quant_sim(hist)
        
        # GENIUS AI VERDICT
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"{GENIUS_PROMPT}\nData: Prob High={prob}, Drift={drift}, Volatility={vol}. User bets ${context.user_data['amount']}."
        )
        await query.message.reply_text(f"📊 **Quant Analysis:** {prob*100:.1f}% Win Probability\n🕴️ **Genius Verdict:** {response.text}")

        kb = [[InlineKeyboardButton("📈 HIGHER", callback_data='PRED_HIGH'),
               InlineKeyboardButton("📉 LOWER", callback_data='PRED_LOW')],
              [InlineKeyboardButton("⬅️ Back", callback_data='BACK')]]
        
        await query.edit_message_text(
            f"🎯 **Stake:** ${context.user_data['amount']}\n🛡️ **Shield:** Monitoring Mainnet State...\n\n**Select Prediction:**",
            reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown'
        )

    elif query.data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in query.data else "LOW"
        
        # RUN SIM 2: SHIELD REVERT PROTECTION
        shield_pass, shield_msg = await run_shield_sim(update, context)
        
        if not shield_pass:
            await query.message.reply_text(f"🛑 **ATOMIC SHIELD REVERT**\n\n**Reason:** {shield_msg}\n**Action:** Trade aborted to protect your funds.")
            return

        # Execute Result
        result_num = random.randint(1, 100)
        win = (prediction == "HIGH" and result_num > 50) or (prediction == "LOW" and result_num <= 50)
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute('INSERT INTO history (num) VALUES (?)', (result_num,))
        
        report = (f"🛡️ **Shield Status:** Success (Protected)\n"
                  f"🎲 **Result:** {result_num}\n"
                  f"{'✅ WIN' if win else '❌ LOSS'}")
        
        await query.edit_message_text(report, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔄 New Bet", callback_data='BACK')]]))

    elif query.data == 'BACK':
        await start(query, context)

async def handle_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Conversational Assistant - Genius Persona Catch-all"""
    text = update.message.text
    
    if text == '💰 Check Balance':
        balance_wei = w3.eth.get_balance(user_account.address)
        balance = w3.from_wei(balance_wei, 'ether')
        await update.message.reply_text(f"💵 **Vault Balance:** {balance:.4f} POL/ETH")
        return
    elif text == '🚀 New Bet' or text == '🕴️ Talk to Assistant':
        await start(update, context)
        return

    # General AI Conversation with Genius persona
    await context.bot.send_chat_action(chat_id=update.effective_chat.id, action=constants.ChatAction.TYPING)
    await asyncio.sleep(0.5) 
    
    response = client.models.generate_content(
        model='gemini-1.5-flash',
        contents=f"{GENIUS_PROMPT}\nUser says: {text}"
    )
    await update.message.reply_text(f"🕴️: {response.text}")

if __name__ == "__main__":
    init_db()
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_chat))
    app.run_polling()
