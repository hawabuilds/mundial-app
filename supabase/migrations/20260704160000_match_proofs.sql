-- TxLINE on-chain score validation proofs (fetched after settlement).
-- Service-role access only — no anon/authenticated policies.

create table if not exists public.match_proofs (
  fixture_id bigint primary key,
  tx_fixture_id bigint not null,
  seq integer not null,
  stat_keys text not null,
  proof_payload jsonb not null,
  proof_reference text,
  proof_ts bigint,
  fetched_at timestamptz not null default now()
);

create index if not exists match_proofs_tx_fixture_id_idx
  on public.match_proofs (tx_fixture_id);

alter table public.match_proofs enable row level security;
