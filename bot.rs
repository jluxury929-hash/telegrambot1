mod predictor; // Links main/predictor.rs
mod risk;      // Links main/risk.rs

use predictor::{AIPredictor, Signal};
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("{}", "🚀 AEGIS BOT ACTIVE: ROOT FOLDER /MAIN".green().bold());
    
    loop {
        // High-Probability Prediction
        let prices = vec![1.10, 1.12, 1.05, 1.08, 1.09]; 
        let (signal, conf) = AIPredictor::get_prediction(&prices);
        
        println!("Signal: {:?} at {}%", signal, conf);
        sleep(Duration::from_secs(60)).await;
    }
}
