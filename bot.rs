mod predictor; 

use predictor::{AIPredictor, Signal};
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("{}", "🚀 AEGIS ENGINE: BOOTING WITH CARGO FIX".green().bold());

    loop {
        let prices = vec![1.10, 1.15, 1.05]; // High-probability signals
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        if signal != Signal::Neutral {
            println!("🤖 Trade Detected: {:?} ({}%)", signal, confidence);
        }
        sleep(Duration::from_secs(60)).await;
    }
}
