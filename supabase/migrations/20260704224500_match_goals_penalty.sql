alter table public.match_goals
  add column if not exists is_penalty boolean not null default false;
