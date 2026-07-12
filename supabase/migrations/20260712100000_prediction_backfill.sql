-- Pending prediction backfill jobs (X outage recovery). Self-disables when all rows are done/abandoned.
create table if not exists public.prediction_backfill (
  match_id bigint primary key,
  tweet_id text not null,
  home_team text,
  away_team text,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'abandoned')),
  attempts integer not null default 0,
  started_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_error text,
  last_result jsonb
);

create index if not exists prediction_backfill_status_idx
  on public.prediction_backfill (status);

alter table public.prediction_backfill enable row level security;
