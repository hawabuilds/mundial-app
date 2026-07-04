use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub const IX_SYSVAR_ID: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub signer: [u8; 32],
    pub mint: Pubkey,
    pub total_reserved: u64,
    pub latest_epoch: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Epoch {
    pub epoch_id: u64,
    pub pot: u64,
    pub claimed: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimMarker {
    pub used: bool,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        init, payer = admin,
        seeds = [b"vault"], bump,
        token::mint = mint,
        token::authority = vault,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct OpenEpoch<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub operator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
        token::mint = config.mint,
        token::authority = vault
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init, payer = payer, space = 8 + Epoch::INIT_SPACE,
        seeds = [b"epoch" as &[u8], &epoch_id.to_le_bytes() as &[u8]],
        bump
    )]
    pub epoch: Account<'info, Epoch>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64, amount: u64, voucher_id: [u8;32])]
pub struct Claim<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"epoch" as &[u8], &epoch_id.to_le_bytes() as &[u8]],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, Epoch>,
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
        token::mint = config.mint,
        token::authority = vault
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = config.mint
    )]
    pub recipient_token: Account<'info, TokenAccount>,
    #[account(
        init, payer = payer, space = 8 + ClaimMarker::INIT_SPACE,
        seeds = [b"claim" as &[u8], &voucher_id as &[u8]], bump
    )]
    pub claim_marker: Account<'info, ClaimMarker>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = IX_SYSVAR_ID)]
    pub ix_sysvar: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct Rescue<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault"],
        bump,
        token::mint = config.mint,
        token::authority = vault
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = config.mint,
        token::authority = admin
    )]
    pub admin_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum Err {
    #[msg("paused")]
    Paused,
    #[msg("not operator")]
    NotOperator,
    #[msg("not admin")]
    NotAdmin,
    #[msg("epoch id not increasing")]
    EpochNotIncreasing,
    #[msg("zero pot")]
    ZeroPot,
    #[msg("zero amount")]
    ZeroAmount,
    #[msg("insufficient unreserved funds")]
    InsufficientFunds,
    #[msg("epoch mismatch")]
    EpochMismatch,
    #[msg("claim exceeds epoch pot")]
    ExceedsPot,
    #[msg("exceeds unreserved surplus")]
    ExceedsUnreserved,
    #[msg("bad signature")]
    BadSig,
    #[msg("bad sysvar")]
    BadSysvar,
    #[msg("math overflow")]
    Math,
}
