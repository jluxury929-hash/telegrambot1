use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod pocket_guard {
    use super::*;

    pub fn check_win(ctx: Context<Guard>, direction: u8, strike: u64) -> Result<()> {
        let price_data = &ctx.accounts.price_update;
        let current_price = price_data.price_message.price as u64;

        // ATOMIC WIN LOGIC:
        // direction 1 = UP. If price is lower than strike, CRASH the transaction.
        // This triggers the Jito reversal.
        if (direction == 1 && current_price <= strike) || 
           (direction == 0 && current_price >= strike) {
            return err!(ErrorCode::NotWinning);
        }

        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Reverting: Price move not profitable. Saved capital.")]
    NotWinning,
}
