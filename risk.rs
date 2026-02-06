pub struct RiskManager {
    pub daily_limit: f64,
    pub current_loss: f64,
}

impl RiskManager {
    pub fn calculate_stake(&self, balance: f64) -> f64 {
        // Professional risk: 2% per trade
        (balance * 0.02).max(1.0).round()
    }
}
