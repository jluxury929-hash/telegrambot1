import os
import random
import numpy as np
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. SETUP
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SEED = os.getenv("WALLET_SEED")
RPC = os.getenv("RPC_URL", "https://polygon-rpc.com")

if not all([API_KEY, TOKEN, SEED]):
    raise ValueError("❌ MISSING VARIABLES: Set API_KEY, TOKEN, and SEED in Railway.")

client = genai.Client(api_key=API_KEY)
w3 = Web3(Web3.HTTPProvider(RPC))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(SEED)

history = [random.randint(1, 100) for _ in range(20)]

# 2. MONTE CARLO ENGINE
def run_simulation(data, iterations=10000):
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=iterations))
    return np.sum(sim_results > 50) / iterations

# 3. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    balance = w3.from_wei(w3.eth.get_balance(user_account.address), 'ether')
    
    keyboard = [
        [InlineKeyboardButton("📈 Bet HIGH", callback_data='BET_HIGH')],
        [InlineKeyboardButton("📉 Bet LOW", callback_data='BET_LOW')],
        [InlineKeyboardButton("💰 Check Balance", callback_data='CHECK_BAL')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    welcome_text = (
        f"🕴️ **VIP Assistant & Mainnet Bot**\n\n"
        f"Boss, your vault is ready.\n\n"
        f"📥 **DEPOSIT ADDRESS (REAL):**\n`{user_account.address}`\n\n"
        f"💵 **BALANCE:** {balance:.4f} POL/ETH\n\n"
        f"I will run a 10,000-scenario simulation before every bet. Select your move:"
    )
    await update.message.reply_text(welcome_text, parse_mode='Markdown', reply_markup=reply_markup)

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == 'CHECK_BAL':
        balance = w3.from_wei(w3.eth.get_balance(user_account.address), 'ether')
        await query.edit_message_text(f"💵 **Current Balance:** {balance:.4f} POL/ETH\n\nUse /start to bet again.", parse_mode='Markdown')
        return

    # BETTING LOGIC
    prediction = "HIGH" if "HIGH" in query.data else "LOW"
    await query.edit_message_text("📊 *Running Monte Carlo Simulations...*", parse_mode='Markdown')

    # 1. Math & AI
    prob_high = run_simulation(history)
    prompt = (f"The simulation shows a {prob_high*100:.1f}% chance of HIGH. "
              f"The user wants to bet {prediction}. Give a quick 1-sentence 'Pro Assistant' verdict.")
    
    response = client.models.generate_content(model='gemini-1.5-flash', contents=prompt)
    
    # 2. Result
    result_num = random.randint(1, 100)
    history.append(result_num)
    win = (prediction == "HIGH" and result_num > 50) or (prediction == "LOW" and result_num <= 50)

    report = (
        f"🕴️ **Assistant's Verdict:**\n{response.text}\n\n"
        f"🎰 **Result:** {result_num}\n"
        f"{'✅ STREAK CONTINUES! YOU WON.' if win else '❌ A temporary dip. LOSS.'}\n\n"
        f"Use /start to go again."
    )
    await query.edit_message_text(report, parse_mode='Markdown')

async def assistant_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # This allows the AI to chat as an assistant if you type anything else
    response = client.models.generate_content(
        model='gemini-1.5-flash',
        contents=f"You are a luxury personal assistant for a crypto high-roller. User says: {update.message.text}"
    )
    await update.message.reply_text(f"🕴️: {response.text}")

# 4. RUN
if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_handler))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), assistant_chat))
    print("Mainnet UI Bot is LIVE.")
    app.run_polling()
