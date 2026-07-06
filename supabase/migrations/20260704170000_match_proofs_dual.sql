-- Dual TxLINE proofs per settled match: official (finalised totals) + regulation (settlement basis).

alter table public.match_proofs
  add column if not exists official_payload jsonb,
  add column if not exists regulation_payload jsonb,
  add column if not exists official_seq integer,
  add column if not exists regulation_seq integer,
  add column if not exists official_stat_keys text,
  add column if not exists regulation_stat_keys text,
  add column if not exists seq_source text;
