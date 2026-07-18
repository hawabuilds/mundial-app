-- First-goalscorer bonus settlement (additive; scoreline points unchanged when void/wrong).
alter table public.predictions
  add column if not exists first_goalscorer_bonus integer;

alter table public.match_state
  add column if not exists first_goalscorer_settled_at timestamptz;

create index if not exists match_state_first_goalscorer_settled_idx
  on public.match_state (first_goalscorer_settled_at)
  where first_goalscorer_settled_at is null;
