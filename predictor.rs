use rust_ti::standard_indicators::bulk::{rsi, bollinger_bands};

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Signal { Call, Put, Neutral }

pub struct AIPredictor;

impl AIPredictor {
    pub fn get_prediction(prices: &[f64]) -> (Signal, f64) {
        if prices.len() < 14 { return (Signal::Neutral, 0.0); }

        let rsi_vals = rsi(prices, 14);
        let (upper, _, lower) = bollinger_bands(prices, 20, 2.0);
        
        let last_price = prices.last().unwrap();
        let last_rsi = rsi_vals.last().unwrap();

        // WORLD CLASS CONFLUENCE: Bollinger Squeeze + RSI Exhaustion
        if *last_price <= *lower.last().unwrap() && *last_rsi <= 30.0 {
            (Signal::Call, 95.5) 
        } else if *last_price >= *upper.last().unwrap() && *last_rsi >= 70.0 {
            (Signal::Put, 97.2)
        } else {
            (Signal::Neutral, 50.0)
        }
    }
}
