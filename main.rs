mod predictor;
mod risk;

use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let mut risk_manager = RiskManager { daily_loss_limit: 50.0, current_loss: 0.0 };
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    
    println!("{}", "=== AEGIS RUST BOT ACTIVE ===".green().bold());
    println!("Mode: {}", if auto_mode { "AUTOMATIC".red() } else { "MANUAL".blue() });

    loop {
        // FETCH LIVE DATA HERE (Example values)
        let prices = vec![1.101, 1.102, 1.100, 1.098, 1.097, 1.096, 1.095]; 

        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 88.0 {
            let stake = risk_manager.calculate_stake(1000.0);
            
            if auto_mode {
                println!("🤖 [AUTO] Placing {:?} bet | Stake: ${} | Conf: {}%", signal, stake, confidence);
                // BROKER API CALL HERE
            } else {
                println!("📢 [SIGNAL] {:?} | Rec. Stake: ${} | Conf: {}%", signal, stake, confidence);
            }
        } else {
            println!("Scanning 1-minute crypto candles...");
        }

        sleep(Duration::from_secs(60)).await;
    }
}
