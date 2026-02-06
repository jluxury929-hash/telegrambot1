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
    
    println!("{}", "🚀 AEGIS BOT V1.0 DEPLOYED".green().bold());

    loop {
        // FETCH REAL PRICES HERE (Example set for now)
        let prices = vec![1.10, 1.12, 1.11, 1.09, 1.07, 1.06, 1.05]; 

        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 90.0 {
            let stake = risk.calculate_stake(1000.0);
            if auto_mode {
                println!("🤖 [AUTO] Placing {:?} | Stake: ${} | Conf: {}%", signal, stake, confidence);
            } else {
                println!("📢 [SIGNAL] {:?} | Confidence: {}%", signal, confidence);
            }
        }
        sleep(Duration::from_secs(60)).await;
    }
}
