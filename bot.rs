mod predictor; // This connects predictor.rs
mod risk;      // This connects risk.rs

use predictor::{AIPredictor, Signal};
use colored::*;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() {
    println!("{}", "🚀 AEGIS BOT STARTED FROM ROOT/MAIN/".green().bold());
    loop {
        let prices = vec![1.10, 1.11, 1.05]; // Replace with live data
        let (signal, conf) = AIPredictor::get_prediction(&prices);
        println!("Signal: {:?} at {}%", signal, conf);
        sleep(Duration::from_secs(60)).await;
    }
}
