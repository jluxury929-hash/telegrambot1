mod predictor; // Links predictor.rs
mod risk;      // Links risk.rs

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    let risk_mgr = RiskManager { daily_limit: 100.0, current_loss: 0.0 };
    
    println!("{}", "🚀 AEGIS BOT V1.0 - ROOT/MAIN DEPLOYMENT".green().bold());

    loop {
        // WORLD-CLASS PRICE PREDICTOR: RSI + BOLLINGER CONFLUENCE
        let prices = vec![1.10, 1.12, 1.05, 1.08, 1.09, 1.07, 1.06]; 
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 90.0 {
            let stake = risk_mgr.calculate_stake(1000.0);
            if auto_mode {
                println!("🤖 [AUTO] Placing {:?} | Stake: ${} | Conf: {}%", signal, stake, confidence);
                // broker_api::execute(signal, stake).await;
            } else {
                println!("📢 [SIGNAL] {:?} | Conf: {}% | RECOMMENDED: ${}", signal, confidence, stake);
            }
        }
        sleep(Duration::from_secs(60)).await;
    }
}
