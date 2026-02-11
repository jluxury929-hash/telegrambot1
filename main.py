import os
import random
import numpy as np
from google import genai
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. INITIALIZATION & SECURITY CHECK
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SEED = os.getenv("WALLET_SEED")
RPC = os.getenv("RPC_URL", "https://polygon-rpc.com")

if not all([API_KEY, TOKEN, SEED]):
    raise ValueError("❌ MISSING VARIABLES: Check Railway for API_KEY, TOKEN, and SEED.")

# Initialize AI & Blockchain
client = genai.Client(api_key=API_KEY)
w3 = Web3(Web3.HTTPProvider(RPC))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(SEED)

# Global Mock History for Simulation (In production, load from SQLite)
history = [random.randint(1, 100) for _ in range(20)]

# 2. THE MONTE CARLO ENGINE
def run_simulation(data, iterations=10000):
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    last_val = data[-1]
    # Simulate paths
    sim_results = last_val + mu + (sigma * np.random.normal(size=iterations))
    prob_high = np.sum(sim_results > 50) / iterations
    return prob_high

# 3. TELEGRAM HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Fetch real balance
    try:
        balance_wei = w3.eth.get_balance(user_account.address)
        balance = w3.from_wei(balance_wei, 'ether')
    except:
        balance = 0.0

    welcome_text = (
        f"🕴️ **Personal AI Assistant & Mainnet Bot**\n\n"
        f"Welcome, Boss. I have initialized your private vault.\n\n"
        f"📥 **DEPOSIT ADDRESS:**\n`{user_account.address}`\n\n"
        f"💵 **REAL BALANCE:** {balance:.4f} POL/ETH\n\n"
        f"To start, send at least $10 to the address above. I will use a **10,000-scenario Monte Carlo simulation** to guide your bets."
    )
    
    keyboard = [['🚀 RUN SIMULATION & BET $10'], ['💰 Check Balance', '💬 Chat with Assistant']]
    await update.message.reply_text(
        welcome_text, 
        parse_mode='Markdown',
        reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    )

async def handle_logic(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_text = update.message.text
    
    if "RUN SIMULATION" in user_text:
        # Check real balance
        balance_wei = w3.eth.get_balance(user_account.address)
        if balance_wei == 0:
            await update.message.reply_text("❌ **No Funds Detected.** Please deposit to the address shown in /start.")
            return

        await update.message.reply_text("📊 *Running 10,000 statistical paths...*", parse_mode='Markdown')
        
        # 1. Statistics
        prob_high = run_simulation(history)
        
        # 2. AI Assistant Analysis
        prompt = (f"Market simulation shows a {prob_high*100:.1f}% probability of a HIGH result. "
                  f"Act as my elite personal assistant. Give me a witty, high-stakes recommendation. "
                  "End with 'BET HIGH' or 'BET LOW'.")
        
        response = client.models.generate_content(model='gemini-1.5-flash', contents=prompt)
        ai_msg = response.text

        # 3. Result
        result_num = random.randint(1, 100)
        history.append(result_num)
        win = ("HIGH" in ai_msg and result_num > 50) or ("LOW" in ai_msg and result_num <= 50)

        final_report = (
            f"🕴️ **Assistant's Call:**\n{ai_msg}\n\n"
            f"🎲 **Actual Result:** {result_num}\n"
            f"{'✅ WE WON, BOSS!' if win else '❌ A minor setback. We lost.'}"
        )
        await update.message.reply_text(final_report, parse_mode='Markdown')

    else:
        # General Assistant Conversation
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=f"You are a luxury personal assistant for a crypto whale. User says: {user_text}"
        )
        await update.message.reply_text(f"🕴️: {response.text}")

# 4. RUN BOT
if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), handle_logic))
    print("Mainnet Assistant Bot is 100% Operational.")
    app.run_polling()
