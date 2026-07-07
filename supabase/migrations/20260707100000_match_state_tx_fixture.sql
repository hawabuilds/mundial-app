-- TxLINE auto-discovered fixtures: map FixtureId and track thread registration.

alter table public.match_state
  add column if not exists tx_fixture_id bigint;

alter table public.match_state
  add column if not exists fixture_status text;

alter table public.match_state
  add column if not exists competition text;

create unique index if not exists match_state_tx_fixture_id_uidx
  on public.match_state (tx_fixture_id)
  where tx_fixture_id is not null;

create index if not exists match_state_fixture_status_idx
  on public.match_state (fixture_status)
  where fixture_status is not null;
