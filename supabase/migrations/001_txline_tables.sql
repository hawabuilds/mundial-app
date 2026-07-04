-- TxLINE hackathon tables: goal accumulation + pre-kickoff odds lock + score breakdown.

create table if not exists public.match_goals (
  fixture_id bigint not null,
  goal_key   text not null,
  minute     int,
  side       text not null,
  player     text,
  own_goal   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (fixture_id, goal_key)
);

create table if not exists public.match_odds (
  fixture_id bigint primary key,
  home_pct   numeric not null,
  draw_pct   numeric not null,
  away_pct   numeric not null,
  locked_at  timestamptz not null default now()
);

alter table public.predictions
  add column if not exists score_base numeric,
  add column if not exists score_multiplier numeric;

alter table public.match_goals enable row level security;
alter table public.match_odds enable row level security;

drop policy if exists "match_goals read" on public.match_goals;
create policy "match_goals read" on public.match_goals for select using (true);

drop policy if exists "match_odds read" on public.match_odds;
create policy "match_odds read" on public.match_odds for select using (true);
