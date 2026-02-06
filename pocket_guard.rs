use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

declare_id!("YOUR_PROGRAM_ID_HERE");

#[program]
pub mod pocket_robot_guard {
    use super::*;

    pub fn execute_guarded_bet(
        ctx: Context<GuardedBet>, 
        asset_id: u8, 
        direction: u8, // 1 for UP, 0 for DOWN
        strike_price: u64
    ) -> Result<()> {
        let price_update = &ctx.accounts.price_update;
        
        // Get the current price from Pyth (must be fresh within 30 seconds)
        let price_data = price_update.get_price_no_older_than(
            &Clock::get()?, 
            30, 
            &get_feed_id(asset_id)
        )?;

        let current_price = price_data.price as u64;

        // ATOMIC REVERSAL CHECK
        // If the price did not move in the predicted direction, return an Error.
        // This causes the entire Jito Bundle (Flash Loan + Bet) to REVERT.
        let is_win = if direction == 1 { current_price > strike_price } else { current_price < strike_price };

        if !is_win {
            return err!(ErrorCode::TradeLosingGuard);
        }

        msg!("✅ Win Confirmed! Price: {} > Strike: {}", current_price, strike_price);
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Reverting bundle: Price move not profitable.")]
    TradeLosingGuard,
}

fn get_feed_id(id: u8) -> [u8; 32] {
    // Standard Pyth Feed IDs for SOL, BTC, ETH, BNB
    let hex = match id {
        0 => "ef0d8b6fda2ceba41da3678a2abc36b5c262a1e758dd3a2176b054b97c6c0036", // SOL
        1 => "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC
        _ => "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH
    };
    let mut bytes = [0u8; 32];
    for i in 0..32 { bytes[i] = u8::from_str_radix(&hex[i*2..i*2+2], 16).unwrap(); }
    bytes
}

#[derive(Accounts)]
pub struct GuardedBet<'info> {
    #[account(mut)] pub user: Signer<'info>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}
