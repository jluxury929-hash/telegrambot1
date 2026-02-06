mod predictor;
mod risk;

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    // Read config from Railway Environment Variables
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    let mut risk = RiskManager { daily_limit: 100.0, current_loss: 0.0 };
    
    println!("{}", "🚀 AEGIS RUST BOT DEPLOYED SUCCESSFULLY".green().bold());
    println!("Mode: {}", if auto_mode { "AUTOMATIC".red() } else { "MANUAL".blue() });

    loop {
        // 1. Fetch live data (Simulated here—connect your API for real trades)
        let prices = vec![100.1, 100.5, 99.8, 99.2, 98.5, 98.1, 98.0]; 

        // 2. AI Analysis
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        // 3. Execution
        if signal != Signal::Neutral && confidence > 88.0 {
            let stake = risk.calculate_stake(1000.0); // Assuming $1000 balance
            
            match (auto_mode, signal) {
                (true, Signal::Call) => println!("🤖 [AUTO] Executed CALL | Stake: ${} | Conf: {}%", stake, confidence),
                (true, Signal::Put) => println!("🤖 [AUTO] Executed PUT | Stake: ${} | Conf: {}%", stake, confidence),
                (false, _) => println!("📢 [SIGNAL] {:?} Detected | Confidence: {}%", signal, confidence),
                _ => (),
            }
        } else {
            println!("Scanning 1m candles for high-probability setups...");
        }

        // Wait for next candle (60s)
        sleep(Duration::from_secs(60)).await;
    }
}
