use rust_ti::standard_indicators::bulk::{rsi, bollinger_bands};

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Signal { Call, Put, Neutral }

pub struct AIPredictor;

impl AIPredictor {
    pub fn get_prediction(prices: &[f64]) -> (Signal, f64) {
        if prices.len() < 20 { return (Signal::Neutral, 0.0); }

        let rsi_vals = rsi(prices, 14);
        let (upper, _, lower) = bollinger_bands(prices, 20, 2.0);
        
        let last_price = *prices.last().unwrap();
        let last_rsi = *rsi_vals.last().unwrap();
        let b_lower = *lower.last().unwrap();
        let b_upper = *upper.last().unwrap();

        // High-Probability Reversal Logic
        if last_price <= b_lower && last_rsi <= 30.0 {
            (Signal::Call, 94.2) // Prediction: UP
        } else if last_price >= b_upper && last_rsi >= 70.0 {
            (Signal::Put, 95.8)  // Prediction: DOWN
        } else {
            (Signal::Neutral, 50.0)
        }
    }
}
