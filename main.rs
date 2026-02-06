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
    println!("Mode: {}", if auto_mode { "AUTOMATIC".red() } else { "MANUAL".blue() });

    loop {
        // MOCK DATA: replace with real broker WebSocket data for real profit
        let prices = vec![1.08, 1.09, 1.07, 1.05, 1.04, 1.03, 1.02]; 

        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 90.0 {
            let stake = risk.calculate_stake(1000.0);
            if auto_mode {
                println!("🤖 [AUTO] Placing {:?} | Stake: ${} | Conf: {}%", signal, stake, confidence);
                // EXECUTE REAL API BET HERE
            } else {
                println!("📢 [SIGNAL] {:?} | Conf: {}% | RECOMMEND: ${}", signal, confidence, stake);
            }
        } else {
            println!("Scanning 1m candles for high-probability setups...");
        }

        sleep(Duration::from_secs(60)).await;
    }
}
