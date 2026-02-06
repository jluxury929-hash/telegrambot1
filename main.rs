mod predictor;
mod risk;

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    // 1. Initialize Protections
    let mut risk_manager = RiskManager { 
        daily_loss_limit: 50.0, 
        current_loss: 0.0,
        initial_balance: 1000.0 
    };
    
    // Read from Railway Environment Variables
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    
    println!("{}", "=== AEGIS RUST BOT DEPLOYED AND ACTIVE ===".green().bold());
    
    loop {
        // 2. Data Acquisition (Simplified for example - connect to your API here)
        let prices = vec![1.102, 1.103, 1.101, 1.099, 1.098, 1.097, 1.100]; 

        // 3. AI Prediction Inference
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        // 4. Execution Logic
        if signal != Signal::Neutral && confidence > 88.0 {
            let stake = risk_manager.get_stake_amount(1000.0);
            
            if auto_mode {
                println!("🤖 [AUTO-TRADE] Executing {:?} | Stake: ${} | Confidence: {}%", 
                    signal, stake, confidence);
                // CALL YOUR BROKER API HERE
            } else {
                println!("📢 [SIGNAL] {:?} | Rec. Stake: ${} | Confidence: {}%", 
                    signal, stake, confidence);
            }
        } else {
            println!("Scanning 1m candles for high-probability reversals...");
        }

        // 1-minute interval to match Pocket Option candle cycles
        sleep(Duration::from_secs(60)).await;
    }
}
