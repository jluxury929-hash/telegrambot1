mod predictor; // This is the "glue" that connects predictor.rs

use predictor::{AIPredictor, Signal};
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    let auto_mode = std::env::var("AUTO_MODE").unwrap_or("false".to_string()) == "true";
    
    println!("{}", "🚀 AEGIS ENGINE ONLINE | ROOT: /MAIN".green().bold());
    println!("Mode: {}", if auto_mode { "AUTOMATIC".red() } else { "MANUAL".blue() });

    loop {
        // High-Probability Price Feed (Mock Data)
        let prices = vec![1.10, 1.11, 1.09, 1.08, 1.07, 1.06, 1.05]; 

        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral && confidence > 90.0 {
            let stake = (1000.0 * 0.02).round(); // 2% Risk Guard
            if auto_mode {
                println!("🤖 [AUTO] Placing {:?} | Stake: ${} | Conf: {}%", signal, stake, confidence);
            } else {
                println!("📢 [SIGNAL] {:?} | Conf: {}% | RECOMMEND: ${}", signal, confidence, stake);
            }
        }
        sleep(Duration::from_secs(60)).await;
    }
}
