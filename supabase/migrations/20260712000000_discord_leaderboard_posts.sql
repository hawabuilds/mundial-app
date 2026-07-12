-- Idempotency guard: one Discord leaderboard post per snapshot epoch.
create table if not exists public.discord_leaderboard_posts (
  epoch_id bigint primary key,
  posted_at timestamptz not null default now()
);

alter table public.discord_leaderboard_posts enable row level security;
