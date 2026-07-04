-- Run once in Supabase SQL editor (Dashboard → SQL → New query).
-- Required for season leaderboard: one prediction row per user PER MATCH.

alter table predictions drop constraint if exists predictions_pkey;
alter table predictions add primary key (user_id, match_id);
alter table predictions
  add column if not exists points integer;

alter table predictions
  add column if not exists replied_at timestamptz;

-- One row per match in app/data/fixtures.ts (synced by cron/scripts before kickoff).
create table if not exists match_state (
  match_id integer primary key,
  predictions_collected_at timestamptz,
  scored_at timestamptz,
  final_home_score integer,
  final_away_score integer,
  match_tweet_id text
);

alter table match_state
  add column if not exists match_tweet_id text;

alter table match_state
  add column if not exists match_fixture_key text;

alter table match_state
  add column if not exists home_team text;

alter table match_state
  add column if not exists away_team text;

alter table match_state
  add column if not exists kickoff_at timestamptz;

alter table predictions enable row level security;
alter table match_state enable row level security;

-- No anon/authenticated policies — API routes and crons use SUPABASE_SERVICE_ROLE_KEY.
-- Apply supabase/migrations/20260704153000_lock_rls.sql on databases created from older schema.sql.

-- Payout wallet mapping (X user_id → EVM address). Written only via API + service_role.
create table if not exists user_wallets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id text not null unique,
  wallet_address text not null,
  updated_at timestamptz not null default now()
);

create index if not exists user_wallets_wallet_address_idx
  on user_wallets (wallet_address);

alter table user_wallets enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated roles.
-- The Next.js /api/link-wallet route uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.

-- Daily payout epochs (pot size + finalization timestamp).
create table if not exists payout_epochs (
  epoch_id bigint primary key,
  pot_wei text not null,
  pot_usd_cents integer,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

alter table payout_epochs enable row level security;

-- Fixed top-20 leaderboard at epoch close (12:00 UTC). Written by snapshot cron + service_role.
create table if not exists leaderboard_snapshots (
  epoch_id bigint not null,
  user_id text not null,
  user_handle text not null,
  rank integer not null,
  total_points integer not null,
  created_at timestamptz not null default now(),
  primary key (epoch_id, user_id),
  constraint leaderboard_snapshots_rank_check check (rank >= 1 and rank <= 20)
);

create index if not exists leaderboard_snapshots_epoch_rank_idx
  on leaderboard_snapshots (epoch_id, rank);

alter table leaderboard_snapshots enable row level security;

-- No policies on payout_epochs or leaderboard_snapshots — service_role only (API + crons).

-- Admin-posted bounties (mundial.xyz/bounty). Written only via API + service_role.
create table if not exists bounties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_path text,
  reward_wei text not null,
  deadline_at timestamptz not null,
  winner_submission_id uuid,
  winner_selected_at timestamptz,
  claim_started_at timestamptz,
  paid_tx_hash text,
  paid_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists bounties_deadline_idx on bounties (deadline_at desc);

-- Migration for databases created before cover images existed.
alter table bounties add column if not exists image_path text;

-- One submission per user per bounty (video upload + social post link).
create table if not exists bounty_submissions (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references bounties(id) on delete cascade,
  user_id text not null,
  user_handle text not null,
  video_path text not null,
  social_post_url text not null,
  created_at timestamptz not null default now(),
  unique (bounty_id, user_id)
);

create index if not exists bounty_submissions_bounty_idx
  on bounty_submissions (bounty_id, created_at);

alter table bounties enable row level security;
alter table bounty_submissions enable row level security;

-- No anon policies — all reads/writes go through Next.js API routes using service_role.

-- Public bucket for bounty submission videos (uploads via signed URLs from the API).
insert into storage.buckets (id, name, public)
values ('bounty-videos', 'bounty-videos', true)
on conflict (id) do nothing;

-- Public bucket for bounty cover images (admin uploads via signed URLs from the API).
insert into storage.buckets (id, name, public)
values ('bounty-images', 'bounty-images', true)
on conflict (id) do nothing;
