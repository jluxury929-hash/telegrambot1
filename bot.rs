use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};

#[tokio::main]
async fn main() {
    let bot = Bot::from_env();

    // The Dashboard Command
    let handler = Update::filter_message().endpoint(|bot: Bot, msg: Message| async move {
        let keyboard = make_dashboard();
        bot.send_message(msg.chat.id, "🚀 **AI TRADER v3.0**\n\n🟢 Status: `Scanning Markets`\n🎯 Target: `BTC/USD` (OTC)\n💰 Profit: `+$142.50` (Today)")
            .parse_mode(teloxide::types::ParseMode::MarkdownV2)
            .reply_markup(keyboard)
            .await?;
        respond(())
    });

    println!("Bot is running...");
    Dispatcher::builder(bot, handler).enable_ctrlc_handler().build().dispatch().await;
}

fn make_dashboard() -> InlineKeyboardMarkup {
    let mut keyboard = Vec::new();

    // Row 1: Trading Controls
    keyboard.push(vec![
        InlineKeyboardButton::callback("▶️ START AUTO", "start"),
        InlineKeyboardButton::callback("🛑 STOP BOT", "stop"),
    ]);

    // Row 2: Analysis
    keyboard.push(vec![
        InlineKeyboardButton::callback("🧠 AI SENTIMENT", "news"),
        InlineKeyboardButton::callback("📊 RSI/ATR", "ta"),
    ]);

    // Row 3: Account Info
    keyboard.push(vec![
        InlineKeyboardButton::callback("💳 WITHDRAW", "money"),
    ]);

    InlineKeyboardMarkup::new(keyboard)
}
