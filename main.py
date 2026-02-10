import os
import random
import numpy as np
from google import genai
from telegram import Update, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

# --- CONFIG ---
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL", "https://polygon-rpc.com")))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(os.getenv("WALLET_SEED"))

# Mock database for history (In production, use SQLite)
history = [random.randint(1, 100) for _ in range(20)]

# --- THE PREDICTION ENGINE ---
def run_monte_carlo_sim(data, iterations=10000):
    """Calculates the probability of HIGH/LOW using statistical paths."""
    returns = np.diff(data)
    mu = np.mean(returns) # Drift
    sigma = np.std(returns) # Volatility
    
    last_val = data[-1]
    high_count = 0
    
    for _ in range(iterations):
        # Simulate next step: Current + Drift + (Volatility * Random Shock)
        simulated_next = last_val + mu + (sigma * np.random.normal())
        if simulated_next > 50:
            high_count += 1
            
    prob_high = high_count / iterations
    return prob_high

async def get_world_best_prediction(prob_high):
    """Sends simulation data to AI for final professional analysis."""
    trend = "BULLISH" if prob_high > 0.6 else "BEARISH" if prob_high < 0.4 else "NEUTRAL"
    prompt = (f"Statistical Simulation shows a {prob_high*100:.2f}% chance of the next number being HIGH. "
              f"The current trend is {trend}. Should we bet $10? Provide a 1-sentence 'Pro-Trader' advice "
              "and then say 'BET HIGH', 'BET LOW', or 'SKIP'.")
    
    response = client.models.generate_content(model='gemini-1.5-flash', contents=prompt)
    return response.text

# --- TELEGRAM HANDLERS ---
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    bal = w3.from_wei(w3.eth.get_balance(user_account.address), 'ether')
    keyboard = [['🚀 RUN ANALYSIS & BET'], ['💰 Balance', '🏦 Wallet Info']]
    await update.message.reply_text(
        f"👑 **World-Class Prediction Bot**\nBalance: {bal:.4f} POL\n"
        "Click below to run a 10,000-scenario Monte Carlo simulation.",
        reply_markup=ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    )

async def handle_action(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if "RUN ANALYSIS" in update.message.text:
        await update.message.reply_text("🔄 Running 10,000 simulations...")
        
        # 1. Run Math
        prob_high = run_monte_carlo_sim(history)
        
        # 2. Run AI Analysis
        analysis = await get_world_best_prediction(prob_high)
        
        # 3. Simulate Bet Result
        real_num = random.randint(1, 100)
        history.append(real_num)
        
        win = ("HIGH" in analysis and real_num > 50) or ("LOW" in analysis and real_num <= 50)
        
        result_msg = (
            f"📊 **Simulation Result:** {prob_high*100:.1f}% High Probability\n"
            f"🧠 **AI Advice:** {analysis}\n\n"
            f"🎲 **Actual Result:** {real_num}\n"
            f"{'✅ PROFIT TARGET HIT' if win else '❌ STOP LOSS TRIGGERED'}"
        )
        await update.message.reply_text(result_msg)

if __name__ == "__main__":
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_BOT_TOKEN")).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT, handle_action))
    print("Mainnet Bot with Monte Carlo Simulation Live.")
    app.run_polling()
