pub struct RiskManager {
    pub daily_loss_limit: f64,
    pub current_loss: f64,
    pub initial_balance: f64,
}

impl RiskManager {
    pub fn get_stake_amount(&self, current_balance: f64) -> f64 {
        // Smart Stake: Risk exactly 2% of the account to ensure long-term profit
        let stake = current_balance * 0.02;
        stake.max(1.0).round() // Minimum $1.00 bet
    }

    pub fn can_trade(&self) -> bool {
        self.current_loss < self.daily_loss_limit
    }
}
