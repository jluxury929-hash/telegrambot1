use rust_ti::standard_indicators::bulk::{rsi, bollinger_bands};

pub enum Signal { Call, Put, Neutral }

pub struct AIPredictor;

impl AIPredictor {
    pub fn get_prediction(prices: &[f64]) -> (Signal, f64) {
        if prices.len() < 20 { return (Signal::Neutral, 0.0); }

        let rsi_val = *rsi(prices, 14).last().unwrap();
        let (upper, _mid, lower) = bollinger_bands(prices, 20, 2.0);
        let current_price = *prices.last().unwrap();

        // WORLD CLASS LOGIC: Confluence of RSI & Bollinger Mean Reversion
        let mut confidence = 0.0;

        if current_price <= *lower.last().unwrap() && rsi_val <= 30.0 {
            confidence = (30.0 - rsi_val) + 70.0; // Higher confidence if RSI is lower
            (Signal::Call, confidence.min(99.0))
        } else if current_price >= *upper.last().unwrap() && rsi_val >= 70.0 {
            confidence = (rsi_val - 70.0) + 70.0;
            (Signal::Put, confidence.min(99.0))
        } else {
            (Signal::Neutral, 0.0)
        }
    }
}
