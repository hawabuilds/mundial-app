-- Play-by-play identity for first-goalscorer settlement (additive; existing columns unchanged).
alter table public.match_goals
  add column if not exists player_id bigint,
  add column if not exists clock_seconds integer,
  add column if not exists seq integer;

create index if not exists match_goals_fixture_clock_seq_idx
  on public.match_goals (fixture_id, clock_seconds, seq);
