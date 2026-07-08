-- Devnet USDC claim audit log (service_role writes only).

create table if not exists solana_claims (
  id uuid primary key default gen_random_uuid(),
  epoch_id bigint not null,
  user_id text not null,
  user_handle text not null,
  recipient_token_account text not null,
  amount_base_units bigint not null,
  tx_signature text not null,
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint solana_claims_tx_signature_key unique (tx_signature)
);

create index if not exists solana_claims_epoch_id_idx
  on solana_claims (epoch_id);

create index if not exists solana_claims_user_id_idx
  on solana_claims (user_id);

alter table solana_claims enable row level security;

-- No anon/authenticated policies — API routes use SUPABASE_SERVICE_ROLE_KEY.
