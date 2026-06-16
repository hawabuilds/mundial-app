use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program, keccak,
    sysvar::instructions::{load_current_index_checked, load_instruction_at_checked},
};
use anchor_spl::token::{self, Transfer};

pub mod state;
use state::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod mundial_rewards {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, operator: Pubkey, signer: [u8; 32]) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.operator = operator;
        cfg.signer = signer;
        cfg.mint = ctx.accounts.mint.key();
        cfg.total_reserved = 0;
        cfg.latest_epoch = 0;
        cfg.paused = false;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn open_epoch(ctx: Context<OpenEpoch>, epoch_id: u64, pot: u64) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require!(!cfg.paused, Err::Paused);
        require_keys_eq!(ctx.accounts.operator.key(), cfg.operator, Err::NotOperator);
        require!(epoch_id > cfg.latest_epoch, Err::EpochNotIncreasing);
        require!(pot > 0, Err::ZeroPot);

        let vault_balance = ctx.accounts.vault.amount;
        let free = vault_balance
            .checked_sub(cfg.total_reserved)
            .ok_or(Err::Math)?;
        require!(free >= pot, Err::InsufficientFunds);

        let epoch = &mut ctx.accounts.epoch;
        epoch.epoch_id = epoch_id;
        epoch.pot = pot;
        epoch.claimed = 0;
        epoch.bump = ctx.bumps.epoch;

        cfg.total_reserved = cfg.total_reserved.checked_add(pot).ok_or(Err::Math)?;
        cfg.latest_epoch = epoch_id;
        Ok(())
    }

    pub fn claim(
        ctx: Context<Claim>,
        epoch_id: u64,
        amount: u64,
        voucher_id: [u8; 32],
    ) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require!(!cfg.paused, Err::Paused);
        require!(amount > 0, Err::ZeroAmount);

        let epoch = &mut ctx.accounts.epoch;
        require!(epoch.epoch_id == epoch_id, Err::EpochMismatch);
        require!(
            epoch.claimed.checked_add(amount).ok_or(Err::Math)? <= epoch.pot,
            Err::ExceedsPot
        );

        ctx.accounts.claim_marker.used = true;

        let msg = keccak::hashv(&[
            crate::ID.as_ref(),
            cfg.mint.as_ref(),
            &epoch_id.to_le_bytes(),
            ctx.accounts.recipient_token.key().as_ref(),
            &amount.to_le_bytes(),
            &voucher_id,
        ]);

        verify_ed25519(&ctx.accounts.ix_sysvar, &cfg.signer, msg.as_ref())?;

        epoch.claimed = epoch.claimed.checked_add(amount).ok_or(Err::Math)?;

        let cfg_mut = &mut ctx.accounts.config;
        cfg_mut.total_reserved = cfg_mut
            .total_reserved
            .checked_sub(amount)
            .ok_or(Err::Math)?;

        let seeds: &[&[u8]] = &[b"vault", &[ctx.bumps.vault]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.recipient_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }

    pub fn set_signer(ctx: Context<AdminOnly>, new_signer: [u8; 32]) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        cfg.signer = new_signer;
        Ok(())
    }

    pub fn set_operator(ctx: Context<AdminOnly>, new_op: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        cfg.operator = new_op;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        cfg.paused = paused;
        Ok(())
    }

    /// One-time devnet migration: rewind latest_epoch so calendar ids (YYYYMMDD) work again.
    pub fn set_latest_epoch(ctx: Context<AdminOnly>, latest_epoch: u64) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        require!(latest_epoch < cfg.latest_epoch, Err::EpochCursorRewind);
        cfg.latest_epoch = latest_epoch;
        Ok(())
    }

    /// One-time devnet migration: lower reserved tally after test epochs (admin only).
    pub fn set_total_reserved(ctx: Context<AdminOnly>, total_reserved: u64) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        require!(total_reserved <= cfg.total_reserved, Err::Math);
        cfg.total_reserved = total_reserved;
        Ok(())
    }

    pub fn rescue_unreserved(ctx: Context<Rescue>, amount: u64) -> Result<()> {
        let cfg = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.admin.key(), cfg.admin, Err::NotAdmin);
        let free = ctx
            .accounts
            .vault
            .amount
            .checked_sub(cfg.total_reserved)
            .ok_or(Err::Math)?;
        require!(amount <= free, Err::ExceedsUnreserved);

        let seeds: &[&[u8]] = &[b"vault", &[ctx.bumps.vault]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.admin_token.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }
}

fn verify_ed25519(ix_sysvar: &AccountInfo, signer: &[u8; 32], msg: &[u8]) -> Result<()> {
    require_keys_eq!(*ix_sysvar.key, IX_SYSVAR_ID, Err::BadSysvar);

    let current_index = load_current_index_checked(ix_sysvar).map_err(|_| Err::BadSig)? as i32;
    require!(current_index > 0, Err::BadSig);

    let mut ed_found = false;
    let mut target_index = current_index - 1;
    let mut ix =
        load_instruction_at_checked(target_index as usize, ix_sysvar).map_err(|_| Err::BadSig)?;

    let mut loops = 0;
    while target_index >= 0 && loops < 10 {
        ix = load_instruction_at_checked(target_index as usize, ix_sysvar)
            .map_err(|_| Err::BadSig)?;
        if ix.program_id == ed25519_program::ID {
            ed_found = true;
            break;
        }
        target_index -= 1;
        loops += 1;
    }
    require!(ed_found, Err::BadSig);

    let data = &ix.data;
    require!(data.len() == (16 + 32 + 64 + msg.len()), Err::BadSig);
    require!(data[0] == 1, Err::BadSig);

    // Matches Solana Ed25519Program layout (see @solana/web3.js ed25519.ts).
    let _signature_offset = u16::from_le_bytes(data[2..4].try_into().unwrap()) as usize;
    let signature_ix_index = u16::from_le_bytes(data[4..6].try_into().unwrap());
    let public_key_offset = u16::from_le_bytes(data[6..8].try_into().unwrap()) as usize;
    let public_key_ix_index = u16::from_le_bytes(data[8..10].try_into().unwrap());
    let message_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let message_size = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;
    let message_ix_index = u16::from_le_bytes(data[14..16].try_into().unwrap());

    require!(signature_ix_index == u16::MAX, Err::BadSig);
    require!(public_key_ix_index == u16::MAX, Err::BadSig);
    require!(message_ix_index == u16::MAX, Err::BadSig);
    require!(message_size == msg.len(), Err::BadSig);

    require!(
        &data[public_key_offset..public_key_offset + 32] == signer,
        Err::BadSig
    );
    require!(
        &data[message_offset..message_offset + message_size] == msg,
        Err::BadSig
    );
    Ok(())
}
