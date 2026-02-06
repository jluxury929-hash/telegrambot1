pub struct RiskManager {
    pub daily_loss_limit: f64,
    pub current_loss: f64,
}

impl RiskManager {
    pub fn is_safe(&self) -> bool {
        self.current_loss < self.daily_loss_limit
    }

    pub fn calculate_stake(&self, balance: f64) -> f64 {
        // Fixed 2% risk management for real profit sustainability
        (balance * 0.02).max(1.0).round()
    }
}
