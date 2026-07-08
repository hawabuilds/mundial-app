-- Accumulate penalty-shootout kicks across live polls (TxLINE snapshot often drops rows).

create table if not exists public.match_penalty_kicks (
  fixture_id bigint not null,
  kick_key text not null,
  side text not null check (side in ('home', 'away')),
  seq integer not null,
  team_kick integer,
  player text,
  player_short text,
  outcome text not null,
  primary key (fixture_id, kick_key)
);

create index if not exists match_penalty_kicks_fixture_idx
  on public.match_penalty_kicks (fixture_id);
