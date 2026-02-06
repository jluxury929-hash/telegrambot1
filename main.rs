mod predictor;
mod risk;

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    let mut risk = RiskManager { daily_limit: 100.0, current_loss: 0.0 };
    
    println!("{}", "🚀 AEGIS RUST BOT V1.0 - DEPLOYED".green().bold());
    println!("Mode: {}", if auto_mode { "AUTOMATIC".red() } else { "MANUAL".blue() });

    loop {
        // 1. DATA (Mocking live feed - connect to your exchange WebSocket here)
        let prices = vec![100.0, 101.2, 99.5, 98.2, 97.5, 97.0]; 

        // 2. PREDICT
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        // 3. EXECUTE
        if signal != Signal::Neutral && confidence > 88.0 {
            let stake = risk.calculate_stake(1000.0); // Assuming $1000 account
            
            if auto_mode {
                println!("🤖 [AUTO] Executed {:?} | Stake: ${} | Conf: {}%", signal, stake, confidence);
                // REAL API CALL: broker.place_bet(signal, stake).await;
            } else {
                println!("📢 [SIGNAL] {:?} Detected | Confidence: {}%", signal, confidence);
            }
        } else {
            println!("Scanning 1m candles for high-probability setups...");
        }

        // Wait for next candle (60s)
        sleep(Duration::from_secs(60)).await;
    }
}
