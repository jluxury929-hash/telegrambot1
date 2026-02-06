pub struct RiskManager {
    pub daily_limit: f64,
    pub current_loss: f64,
}

impl RiskManager {
    pub fn calculate_stake(&self, balance: f64) -> f64 {
        // Professional "Fixed Fractional" betting: 2% risk per trade
        let stake = balance * 0.02;
        stake.max(1.0).round() // Minimum $1.00 per bet
    }

    pub fn is_safe(&self) -> bool {
        self.current_loss < self.daily_limit
    }
}
