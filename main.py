import os
import random
import numpy as np
from google import genai
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler, filters, ContextTypes
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# 1. SETUP & SECURITY
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SEED = os.getenv("WALLET_SEED")
RPC = os.getenv("RPC_URL", "https://polygon-rpc.com")

client = genai.Client(api_key=API_KEY)
w3 = Web3(Web3.HTTPProvider(RPC))
Account.enable_unaudited_hdwallet_features()
user_account = Account.from_mnemonic(SEED)

history = [random.randint(1, 100) for _ in range(20)]

def run_simulation(data, iterations=10000):
    returns = np.diff(data)
    mu, sigma = np.mean(returns), np.std(returns)
    sim_results = data[-1] + mu + (sigma * np.random.normal(size=iterations))
    return np.sum(sim_results > 50) / iterations

# 2. HANDLERS
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    balance = w3.from_wei(w3.eth.get_balance(user_account.address), 'ether')
    
    welcome_text = (
        f"🕴️ **VIP Assistant & Mainnet Bot**\n\n"
        f"Boss, your private vault is online.\n"
        f"📥 **DEPOSIT:** `{user_account.address}`\n"
        f"💵 **REAL BALANCE:** {balance:.4f} POL/ETH\n\n"
        f"Shall we proceed with a simulation? Choose your stake:"
    )
    
    keyboard = [
        [InlineKeyboardButton("💵 $10", callback_data='AMT_10'),
         InlineKeyboardButton("💵 $50", callback_data='AMT_50'),
         InlineKeyboardButton("💵 $100", callback_data='AMT_100')],
        [InlineKeyboardButton("💰 Check Balance", callback_data='CHECK_BAL')]
    ]
    await update.message.reply_text(welcome_text, parse_mode='Markdown', reply_markup=InlineKeyboardMarkup(keyboard))

async def button_click(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    await query.answer()

    # --- STEP 1: Select Amount ---
    if data.startswith('AMT_'):
        amount = data.split('_')[1]
        context.user_data['bet_amount'] = amount
        
        keyboard = [
            [InlineKeyboardButton("📈 HIGHER (51-100)", callback_data='PRED_HIGH')],
            [InlineKeyboardButton("📉 LOWER (1-50)", callback_data='PRED_LOW')],
            [InlineKeyboardButton("⬅️ Back", callback_data='BACK')]
        ]
        await query.edit_message_text(
            f"🎯 **Stake:** ${amount}\nNow, Boss, what is your prediction?",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode='Markdown'
        )

    # --- STEP 2: Run Simulation & Execute ---
    elif data.startswith('PRED_'):
        prediction = "HIGH" if "HIGH" in data else "LOW"
        amount = context.user_data.get('bet_amount', '10')
        
        await query.edit_message_text(f"📊 *Running 10,000 simulations for a ${amount} {prediction} bet...*", parse_mode='Markdown')

        # Run Math
        prob_high = run_simulation(history)
        
        # AI Logic
        prompt = (f"Market simulation shows a {prob_high*100:.1f}% chance of HIGH. "
                  f"User is betting ${amount} on {prediction}. Give me a 1-sentence 'High Roller Assistant' "
                  "commentary and confirm if you agree.")
        response = client.models.generate_content(model='gemini-1.5-flash', contents=prompt)
        
        # Result
        res_num = random.randint(1, 100)
        history.append(res_num)
        win = (prediction == "HIGH" and res_num > 50) or (prediction == "LOW" and res_num <= 50)

        result_msg = (
            f"🕴️ **Assistant's Verdict:**\n{response.text}\n\n"
            f"🎲 **Result:** {res_num}\n"
            f"{'✅ PROFIT! We smashed it.' if win else '❌ Lost this round, Boss.'}\n\n"
            f"Ready for the next one?"
        )
        
        keyboard = [[InlineKeyboardButton("🔄 New Bet", callback_data='BACK')]]
        await query.edit_message_text(result_msg, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode='Markdown')

    elif data == 'BACK':
        # Reset to start menu
        await start(query, context) # Re-trigger start logic

    elif data == 'CHECK_BAL':
        balance = w3.from_wei(w3.eth.get_balance(user_account.address), 'ether')
        await query.message.reply_text(f"💵 **Balance:** {balance:.4f} POL/ETH")

async def chat_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Standard Assistant Chat
    response = client.models.generate_content(
        model='gemini-1.5-flash',
        contents=f"You are a luxury personal assistant. User says: {update.message.text}"
    )
    await update.message.reply_text(f"🕴️: {response.text}")

# 3. RUN
if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(button_click))
    app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), chat_handler))
    print("Mainnet Interactive Bot is Online.")
    app.run_polling()
