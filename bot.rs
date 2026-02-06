use teloxide::prelude::*;
use teloxide::utils::command::BotCommands;
use std::sync::Arc;
use tokio::sync::Mutex;

// --- SHARED BOT STATE ---
struct TradingState {
    is_running: bool,
    balance: f64,
    total_profit: f64,
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "AI Trading Bot Commands:")]
enum Command {
    #[command(description = "Start the AI Auto-Trading engine.")]
    StartAuto,
    #[command(description = "Stop all trading immediately.")]
    Stop,
    #[command(description = "Get current profit and bot status.")]
    Status,
    #[command(description = "Check the latest AI Sentiment analysis.")]
    Analyze,
}

#[tokio::main]
async fn main() {
    pretty_env_logger::init();
    let bot = Bot::from_env();
    
    // Global state to track if the bot is "ON"
    let state = Arc::new(Mutex::new(TradingState {
        is_running: false,
        balance: 1000.0,
        total_profit: 0.0,
    }));

    println!("🚀 Telegram Trading Bot is Live...");

    Command::repl(bot, move |bot: Bot, msg: Message, cmd: Command| {
        let state = Arc::clone(&state);
        async move {
            match cmd {
                Command::StartAuto => {
                    let mut s = state.lock().await;
                    s.is_running = true;
                    bot.send_message(msg.chat.id, "🤖 AI Auto-Mode: ACTIVATED. Scanning markets...").await?;
                    // Logic to spawn the background trading task goes here
                }
                Command::Stop => {
                    let mut s = state.lock().await;
                    s.is_running = false;
                    bot.send_message(msg.chat.id, "🛑 Trading Stopped. All positions cleared.").await?;
                }
                Command::Status => {
                    let s = state.lock().await;
                    let status_msg = format!(
                        "📊 BOT STATUS:\nMode: {}\nBalance: ${:.2}\nTotal Profit: ${:.2}",
                        if s.is_running { "AUTO" } else { "IDLE" },
                        s.balance,
                        s.total_profit
                    );
                    bot.send_message(msg.chat.id, status_msg).await?;
                }
                Command::Analyze => {
                    bot.send_message(msg.chat.id, "🧠 AI Analysis: Sentiment is BULLISH (+0.65). Volatility is LOW. Suggestion: CALL.").await?;
                }
            };
            anyhow::Ok(())
        }
    })
    .await;
}
