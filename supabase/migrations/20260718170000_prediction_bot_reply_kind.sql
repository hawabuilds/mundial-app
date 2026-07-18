-- Allow success + format-nudge bot replies per user per match.
alter table public.prediction_bot_replies
  add column if not exists reply_kind text not null default 'success'
    check (reply_kind in ('success', 'format_nudge'));

alter table public.prediction_bot_replies
  drop constraint if exists prediction_bot_replies_pkey;

alter table public.prediction_bot_replies
  add primary key (match_id, user_id, reply_kind);

create index if not exists prediction_bot_replies_kind_status_created_idx
  on public.prediction_bot_replies (reply_kind, status, created_at);
