-- Live reply-bot scan cursor: last reply tweet id seen for incremental (since_id) fetches.
alter table public.match_state
  add column if not exists reply_bot_since_id text;
