# Supabase RLS and write path

Reward-sensitive tables (`predictions`, `match_state`, `match_odds`, `match_goals`, `leaderboard_snapshots`, `payout_epochs`) must not accept writes from the browser anon key.

## Write path

```
Browser  →  fetch("/api/…")  →  Next.js route handler or Vercel cron  →  getSupabaseAdminClient()  →  Postgres
```

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only and bypasses Row Level Security.

## What the client does

| Data | Client access |
|------|----------------|
| Leaderboard | `GET /api/leaderboard` |
| Personal stats | `GET /api/me/leaderboard-stats` |
| Fixtures board | `GET /api/matches` |
| Predictions / points | Never written from the browser |

Collection and scoring run in cron routes (`/api/cron/kickoff`) and admin APIs using the service role.

## RLS migration

Run once on production (Supabase Dashboard → SQL Editor):

```text
supabase/migrations/20260704153000_lock_rls.sql
```

This drops anon INSERT/UPDATE/DELETE on `predictions` and `match_state`, and public SELECT on `match_goals` / `match_odds`. Fresh installs should use the updated `supabase/schema.sql` and `001_txline_tables.sql` (no permissive policies).

## Verification

- No `"use client"` file imports `getSupabaseAdminClient` or `SUPABASE_SERVICE_ROLE_KEY`.
- `getSupabaseClient()` (anon) is used only for bounty Storage uploads in `app/lib/bounty-client.ts`.
