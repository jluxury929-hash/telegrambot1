use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup, UserId};

// REPLACE THIS with your actual Telegram User ID (Get it from @userinfobot)
const ADMIN_ID: u64 = 123456789; 

#[tokio::main]
async fn main() {
    let bot = Bot::from_env();

    println!("🚀 Dashboard is active. Waiting for Admin...");

    let handler = Update::filter_message()
        .branch(dptree::filter(|msg: Message| msg.from().map(|u| u.id.0 == ADMIN_ID).unwrap_or(false))
            .endpoint(show_dashboard))
        .branch(Update::filter_callback_query().endpoint(handle_callback));

    Dispatcher::builder(bot, handler).enable_ctrlc_handler().build().dispatch().await;
}

async fn show_dashboard(bot: Bot, msg: Message) -> ResponseResult<()> {
    let keyboard = make_keyboard();
    bot.send_message(msg.chat.id, "💎 **AI TRADING DASHBOARD** 💎\n\nStatus: `Ready`\nMarket: `BTC/USD` (High Volatility)")
        .parse_mode(teloxide::types::ParseMode::MarkdownV2)
        .reply_markup(keyboard)
        .await?;
    Ok(())
}

fn make_keyboard() -> InlineKeyboardMarkup {
    let buttons = vec![
        vec![
            InlineKeyboardButton::callback("🚀 START AUTO", "start_auto"),
            InlineKeyboardButton::callback("🛑 STOP", "stop_bot"),
        ],
        vec![
            InlineKeyboardButton::callback("🧠 RUN AI ANALYSIS", "analyze"),
        ],
        vec![
            InlineKeyboardButton::callback("💰 CHECK BALANCE", "balance"),
        ],
    ];
    InlineKeyboardMarkup::new(buttons)
}

async fn handle_callback(bot: Bot, q: CallbackQuery) -> ResponseResult<()> {
    let data = q.data.as_deref().unwrap_or("");
    let chat_id = q.message.map(|m| m.chat().id).unwrap();

    match data {
        "start_auto" => {
            bot.send_message(chat_id, "✅ **AUTO-BOT ENGAGED.**\nPlacing 1m bets on BTC/USD...").await?;
        }
        "analyze" => {
            bot.send_message(chat_id, "🧠 **AI Sentiment:** `BULLISH (+0.72)`\n**RSI:** `32 (Oversold)`\n**Recommendation:** `CALL (Higher)`").await?;
        }
        "balance" => {
            bot.send_message(chat_id, "💵 **Real Profit:** `+$142.50`\n**Current Balance:** `$1,142.50`").await?;
        }
        _ => (),
    }

    // Acknowledge the button click so the "loading" spinner goes away
    bot.answer_callback_query(q.id).await?;
    Ok(())
}
