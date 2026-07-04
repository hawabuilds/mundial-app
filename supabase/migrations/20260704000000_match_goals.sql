-- Accumulates TxLINE play-by-play goals during live matches so FT display keeps
-- scorers/minutes after the scores snapshot trims historical goal rows.

create table if not exists public.match_goals (
  fixture_id bigint not null,
  goal_key text not null,
  minute integer,
  side text not null check (side in ('home', 'away')),
  player text,
  own_goal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fixture_id, goal_key)
);

create index if not exists match_goals_fixture_minute_idx
  on public.match_goals (fixture_id, minute);

alter table public.match_goals enable row level security;
