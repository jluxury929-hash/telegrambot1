mod predictor;
mod risk;

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    let risk = RiskManager { daily_limit: 100.0, current_loss: 0.0 };
    
    println!("{}", "🚀 AEGIS AI BOT V1.0 DEPLOYED".green().bold());
    println!("Targeting Real Profit | Mode: {}", if auto_mode { "AUTO".red() } else { "MANUAL".blue() });

    loop {
        // REPLACE WITH REAL API DATA: let prices = get_pocket_option_data().await;
        let prices = vec![1.05, 1.04, 1.06, 1.03, 1.02, 1.01, 1.00]; 

        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 90.0 {
            let stake = risk.calculate_stake(1000.0);
            if auto_mode {
                println!("🤖 [AUTO-BET] {:?} | Amount: ${} | Conf: {}%", signal, stake, confidence);
                // BROKER_API.place_bet(signal, stake).await;
            } else {
                println!("📢 [SIGNAL] {:?} | Conf: {}% | Place bet now!", signal, confidence);
            }
        }
        sleep(Duration::from_secs(60)).await;
    }
}
