use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("YourProgramIDHere1111111111111111111111");

#[program]
pub mod pocket_robot {
    use super::*;

    pub fn execute_guarded_bet(ctx: Context<Bet>, asset_idx: u8, direction: u8, strike: u64) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        
        // Fetch current price from Pyth
        let feed_id = get_feed_id(asset_idx); 
        let price_data = price_update.get_price_no_older_than(&Clock::get()?, 30, &feed_id)?;
        let current_price = price_data.price as u64;

        // --- THE WIN-OR-REVERT GUARD ---
        // If Betting UP (1) and price <= strike OR Betting DOWN (0) and price >= strike
        if (direction == 1 && current_price <= strike) || (direction == 0 && current_price >= strike) {
            // This error forces the Jito Bundle to fail, saving your capital.
            return err!(ErrorCode::TradeNotWinning);
        }

        msg!("Trade is winning! Proceeding to payout.");
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Reverting: Price condition not met. Capital protected.")]
    TradeNotWinning,
}
