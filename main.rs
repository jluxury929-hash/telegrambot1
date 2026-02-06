mod predictor;
mod risk;

use binary_options_tools::PocketOption;
use predictor::{AIPredictor, Signal};
use risk::RiskManager;
use colored::*;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ssid = "YOUR_SESSION_ID_HERE";
    let asset = "BTCUSD_otc";
    let auto_mode = true; // Set to false for Manual signals only

    let client = PocketOption::new(ssid).await?;
    let risk = RiskManager { max_daily_loss: 100.0, current_loss: 0.0, win_rate: 0.0 };

    println!("{}", "--- Aegis Rust AI Trading Bot Started ---".green().bold());

    loop {
        // 1. Fetch live data
        let balance = client.balance().await.unwrap_or(0.0);
        let prices = vec![98.1, 98.5, 97.0, 96.2, 95.5]; // Example live feed

        // 2. Risk Check
        if !risk.can_trade() {
            println!("{}", "CRITICAL: Daily loss limit reached. Shutting down.".red());
            break;
        }

        // 3. AI Analysis
        let (signal, confidence) = AIPredictor::get_prediction(&prices);

        // 4. Execution
        match signal {
            Signal::Call if confidence > 85.0 => {
                println!("{} - Conf: {}%", "SIGNAL: CALL (UP)".cyan(), confidence);
                if auto_mode {
                    client.buy(asset, 60, risk.calculate_stake(balance)).await?;
                }
            }
            Signal::Put if confidence > 85.0 => {
                println!("{} - Conf: {}%", "SIGNAL: PUT (DOWN)".magenta(), confidence);
                if auto_mode {
                    client.sell(asset, 60, risk.calculate_stake(balance)).await?;
                }
            }
            _ => println!("Scanning market for high-probability setups..."),
        }

        sleep(Duration::from_secs(10)).await; // Poll every 10 seconds
    }
    Ok(())
}
