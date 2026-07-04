-- Lock RLS on reward-sensitive tables: no anon/authenticated direct access.
-- All reads and writes go through Next.js API routes and crons using SUPABASE_SERVICE_ROLE_KEY
-- (service role bypasses RLS).

-- predictions (schema.sql granted anon SELECT/INSERT/UPDATE/DELETE)
drop policy if exists "Allow anon select on predictions" on public.predictions;
drop policy if exists "Allow anon insert on predictions" on public.predictions;
drop policy if exists "Allow anon update on predictions" on public.predictions;
drop policy if exists "Allow anon delete on predictions" on public.predictions;

-- match_state (schema.sql granted anon SELECT/INSERT/UPDATE/DELETE)
drop policy if exists "Allow anon select on match_state" on public.match_state;
drop policy if exists "Allow anon insert on match_state" on public.match_state;
drop policy if exists "Allow anon update on match_state" on public.match_state;
drop policy if exists "Allow anon delete on match_state" on public.match_state;

-- match_goals / match_odds (001_txline_tables.sql granted public SELECT)
drop policy if exists "match_goals read" on public.match_goals;
drop policy if exists "match_odds read" on public.match_odds;

-- leaderboard_snapshots, payout_epochs: RLS enabled with no policies (already service_role only).
