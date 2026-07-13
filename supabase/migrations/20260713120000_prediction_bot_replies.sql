-- Once-per-user-per-match log for the X prediction reply bot.
create table if not exists public.prediction_bot_replies (
  match_id bigint not null,
  user_id text not null,
  user_handle text,
  source_tweet_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  bot_tweet_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists prediction_bot_replies_status_created_idx
  on public.prediction_bot_replies (status, created_at);

create index if not exists prediction_bot_replies_sent_at_idx
  on public.prediction_bot_replies (updated_at)
  where status = 'sent';

alter table public.prediction_bot_replies enable row level security;
