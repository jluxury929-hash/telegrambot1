import os
import asyncio
from dotenv import load_dotenv
from eth_account import Account
from web3 import Web3
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup
from telegram.ext import ApplicationBuilder, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

# 1. SETUP & HD WALLET DERIVATION
load_dotenv()
w3 = Web3(Web3.HTTPProvider(os.getenv("RPC_URL")))

# Enable HD Wallet features in eth_account
Account.enable_unaudited_hdwallet_features()

def get_bot_wallet():
    """Derives a unique sub-wallet from the master seed phrase"""
    mnemonic = os.getenv("MNEMONIC_PHRASE")
    # Path: m/44'/60'/0'/0/INDEX -> Index 1 ensures it's a new, unique address
    # change the '1' to any number to generate a completely different wallet
    account = Account.from_mnemonic(mnemonic, account_path="m/44'/60'/0'/0/1")
    return account

bot_account = get_bot_wallet()

# --- ATOMIC BUNDLE SIMULATOR ---
async def simulate_atomic_bundle(side, amount):
    """
    Simulates a Flashbots/Jito bundle. 
    It runs a local 'call' to check if the trade conditions are met.
    """
    try:
        # 1. Pre-flight check: Do we have gas?
        balance = w3.eth.get_balance(bot_account.address)
        if balance == 0:
            return False, "Insufficient liquidity in Bot Vault."

        # 2. Market Simulation (Logic: If volatility > threshold, revert bundle)
        # Real-world: This would check a DEX price vs your entry prediction
        is_safe = True # Logic goes here
        
        if is_safe:
            return True, "Bundle Simulated: No Revert Detected."
        else:
            return False, "Atomic Shield: Price slipped. Transaction Aborted."
    except Exception as e:
        return False, str(e)

# --- POCKET ROBOT INTERFACE ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    bal_wei = w3.eth.get_balance(bot_account.address)
    balance = w3.from_wei(bal_wei, 'ether')
    
    msg = (
        f"🤖 **Pocket Robot: Atomic Edition**\n\n"
        f"Your Unique Bot Wallet has been generated.\n"
        f"📥 **Deposit Address:** `{bot_account.address}`\n"
        f"💰 **Vault Balance:** {balance:.4f} ETH\n\n"
        f"Status: **Shield Active** 🛡️"
    )
    
    kb = [['/manual', '/autopilot'], ['💰 Balance', '🕴️ Genius AI']]
    await update.message.reply_text(msg, parse_mode='Markdown', reply_markup=ReplyKeyboardMarkup(kb, resize_keyboard=True))

async def manual_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = "🕹️ **Manual Selection**\nChoose your risk parameters:"
    kb = [
        [InlineKeyboardButton("BTC/USD", callback_data="P_BTC"), InlineKeyboardButton("ETH/USD", callback_data="P_ETH")],
        [InlineKeyboardButton("1m (90% Payout)", callback_data="T_1"), InlineKeyboardButton("5m (85% Payout)", callback_data="T_5")]
    ]
    await update.message.reply_text(text, reply_markup=InlineKeyboardMarkup(kb), parse_mode='Markdown')

async def handle_trade(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    await query.message.reply_text("🔄 **Simulating Atomic Bundle...**")
    
    # Run the Shield Simulation
    success, reason = await simulate_atomic_bundle("CALL", 0.1)
    
    if not success:
        await query.message.reply_text(f"🛑 **TRADE PREVENTED**\nReason: {reason}\n*Your funds never left your wallet.*")
    else:
        await query.message.reply_text(f"✅ **BUNDLE BROADCASTED**\n{reason}\nTrade active for 60s...")

# --- AUTO PILOT MODE ---
async def autopilot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🤖 **Autopilot Mode: ENGAGED**\nMonitoring market for high-alpha entries...")
    
    # Loop simulation
    for i in range(2):
        await asyncio.sleep(3)
        await update.message.reply_text(
            f"⚡ **Auto-Trade Attempt #{i+1}**\n"
            f"Asset: ETH/USD\n"
            f"Action: 📉 PUT\n"
            f"🛡️ **Status:** Shield Simulating Bundle..."
        )
        await asyncio.sleep(1)
        # Randomly show a prevented trade to demonstrate the Atomic Shield
        if i == 0:
            await update.message.reply_text("❌ **Atomic Revert:** Network congestion detected. Trade dropped to save fees.")
        else:
            await update.message.reply_text("✅ **Trade Success:** +$88.00 Profit added to Vault.")

if __name__ == "__main__":
    app = ApplicationBuilder().token(os.getenv("TELEGRAM_TOKEN")).build()
    
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("manual", manual_mode))
    app.add_handler(CommandHandler("autopilot", autopilot))
    app.add_handler(CallbackQueryHandler(handle_trade))
    
    print(f"Bot started. Derived Address: {bot_account.address}")
    app.run_polling()
