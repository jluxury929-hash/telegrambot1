pub struct RiskManager {
    pub max_daily_loss: f64,
    pub current_loss: f64,
    pub win_rate: f32,
}

impl RiskManager {
    pub fn can_trade(&self) -> bool {
        self.current_loss < self.max_daily_loss
    }

    pub fn calculate_stake(&self, balance: f64) -> f64 {
        // Fixed 2% risk per trade for "Real Profit" sustainability
        (balance * 0.02).round()
    }
}
