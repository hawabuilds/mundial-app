-- First goalscorer bonus picks (separate from scoreline predictions).
create table if not exists public.first_goalscorer_predictions (
  user_id text not null,
  match_id integer not null,
  user_handle text not null,
  player_id bigint,
  player_name text not null,
  player_side text not null check (player_side in ('home', 'away')),
  predicted_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create index if not exists first_goalscorer_predictions_match_idx
  on public.first_goalscorer_predictions (match_id);

alter table public.first_goalscorer_predictions enable row level security;
