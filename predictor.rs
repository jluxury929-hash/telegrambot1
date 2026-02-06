use rust_ti::standard_indicators::bulk::{rsi, bollinger_bands};

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Signal { Call, Put, Neutral }

pub struct AIPredictor;

impl AIPredictor {
    pub fn get_prediction(prices: &[f64]) -> (Signal, f64) {
        if prices.len() < 20 { return (Signal::Neutral, 0.0); }

        let rsi_vals = rsi(prices, 14);
        let (upper, _mid, lower) = bollinger_bands(prices, 20, 2.0);
        
        let last_price = *prices.last().unwrap();
        let last_rsi = *rsi_vals.last().unwrap();
        let b_lower = *lower.last().unwrap();
        let b_upper = *upper.last().unwrap();

        // WORLD CLASS LOGIC: Mean Reversion + Momentum Exhaustion
        if last_price <= b_lower && last_rsi <= 30.0 {
            let confidence = (30.0 - last_rsi) + 85.0; 
            (Signal::Call, confidence.min(99.0))
        } else if last_price >= b_upper && last_rsi >= 70.0 {
            let confidence = (last_rsi - 70.0) + 85.0;
            (Signal::Put, confidence.min(99.0))
        } else {
            (Signal::Neutral, 50.0)
        }
    }
}
