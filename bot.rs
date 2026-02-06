mod predictor; // This links predictor.rs
mod risk;      // This links risk.rs

use predictor::{AIPredictor, Signal};
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("{}", "🚀 AEGIS BOT STARTED FROM /MAIN ROOT".green().bold());
    
    loop {
        // High-level predictor logic
        let prices = vec![1.10, 1.12, 1.05, 1.08, 1.09]; 
        let (signal, conf) = AIPredictor::get_prediction(&prices);
        
        println!("Signal: {:?} at {}%", signal, conf);
        sleep(Duration::from_secs(60)).await;
    }
}
