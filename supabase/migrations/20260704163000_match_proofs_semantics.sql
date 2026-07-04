-- Extend match_proofs with verification semantics (see lib/txScoreProofSemantics.ts).

alter table public.match_proofs
  add column if not exists semantics_mismatch boolean not null default false,
  add column if not exists show_verified_badge boolean not null default false,
  add column if not exists proof_mode text,
  add column if not exists terminal_status_id integer;
