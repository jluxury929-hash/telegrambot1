use rust_ti::standard_indicators::bulk::{rsi, bollinger_bands};

#[derive(Debug, PartialEq)]
pub enum Signal { Call, Put, Neutral }

pub struct AIPredictor;

impl AIPredictor {
    pub fn get_prediction(prices: &[f64]) -> (Signal, f64) {
        if prices.len() < 20 { return (Signal::Neutral, 0.0); }
        
        let rsi_vals = rsi(prices, 14);
        let (upper, _, lower) = bollinger_bands(prices, 20, 2.0);
        
        let price = prices.last().unwrap();
        let rsi = rsi_vals.last().unwrap();
        let b_lower = lower.last().unwrap();
        let b_upper = upper.last().unwrap();

        // WORLD CLASS PREDICTOR: Confluence of Volatility & Momentum
        if *price <= *b_lower && *rsi <= 30.0 {
            let conf = (30.0 - rsi) + 85.0; // Higher confidence if more oversold
            (Signal::Call, conf.min(99.0))
        } else if *price >= *b_upper && *rsi >= 70.0 {
            let conf = (rsi - 70.0) + 85.0;
            (Signal::Put, conf.min(99.0))
        } else {
            (Signal::Neutral, 50.0)
        }
    }
}
