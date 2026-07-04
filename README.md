# Copa Mundial

A football score-prediction game built around X (Twitter). You reply to a match post with your predicted scoreline before kickoff and earn points based on how close you get — with an **upset bonus** when you beat the TxLINE market. Each day the top 20 on the leaderboard split a USDC prize pool paid out on Solana.

Live at [copamundial.app](https://copamundial.app).

![Copa Mundial — landing and leaderboard](docs/screenshots/cover.png)

## How it works

- Reply to a match thread on X with a scoreline before kickoff — your first valid reply is the one that counts.
- **Scoring** combines accuracy with market odds (see below).
- The leaderboard resets every 3 days so newer players still have a realistic shot at the top.
- A daily snapshot at 10:00 UTC locks in the top 20 and opens on-chain USDC claims.

## Built on TxLINE

Copa Mundial uses [TxLINE](https://txline.txodds.com/documentation/worldcup) (by TxOdds) as the live data layer for World Cup fixtures, scores, and pre-kickoff odds. TxLINE serves scout-verified match data with on-chain validation proofs on Solana.

**Documentation:** [TxLINE World Cup API](https://txline.txodds.com/documentation/worldcup)

### Auth flow

Every API call uses two credentials:

1. **Guest JWT** — `POST /auth/guest/start` returns a short-lived bearer token (refreshed automatically).
2. **API token** — `X-Api-Token` header from a one-time activation (`txodds/get-txodds-key.mjs` → `TXODDS_API_TOKEN` on Vercel).

Both headers are sent on each request:

```
Authorization: Bearer <guest jwt>
X-Api-Token:   <activated api token>
```

### Three endpoints we consume

| Endpoint | Purpose |
|----------|---------|
| `GET /api/fixtures/snapshot` | Schedule + kickoff times for the live board |
| `GET /api/scores/snapshot/{fixtureId}` | Live score, clock, status, latest goal events |
| `GET /api/odds/snapshot/{fixtureId}` | Full-time 1X2 implied % (`1X2_PARTICIPANT_RESULT`) |

Pre-kickoff odds are **locked** to Supabase (`match_goals`, `match_odds`) at first board fetch so the upset multiplier is fair at full time.

### Scoring formula

**Accuracy base** (best tier only — one score per match):

| Tier | Base points |
|------|-------------|
| Exact scoreline | 5 |
| Correct result (win/draw/loss) | 3 |
| Played (wrong result) | 1 |

**Market multiplier** (TxLINE pre-kickoff 1X2, only when exact or result is correct):

```
multiplier = min(3, 100 / impliedPct)
points     = round(base × multiplier)
```

Example: correct underdog call at 5% implied → base 3 × ×3 = **9 pts** (or exact at 5% → **15 pts**).

Implementation: `lib/scoring.ts`. Locked odds: `lib/ensureMatchOdds.ts` → `match_odds` table.

### Validation proofs

TxLINE publishes Solana-backed validation proofs for scout-verified events. Copa Mundial reads the REST snapshots today; on-chain proof verification is documented in the TxLINE API and listed here as the intended production hardening path (not fully wired in-app yet).

## Stack

- Next.js (App Router) + TypeScript
- **TxLINE** — fixtures, live scores, 1X2 odds
- Supabase (Postgres) — users, predictions, locked odds, goal accumulation
- NextAuth with the X provider for sign-in
- Solana + USDC for payouts — signed claim vouchers against an operator-opened payout epoch
- next-intl for translations, CSS Modules for styling
- Vercel, with cron routes for kickoff collection, scoring, and the daily snapshot

## Smart contract

The Solana payout program lives in [`solana-program/`](solana-program/) (Anchor/Rust). It custodies the USDC vault and pays winners against off-chain **signed vouchers**: an operator opens each daily epoch with a fixed pot, the server signs a per-winner voucher, and `claim` verifies the ed25519 signature on-chain before transferring USDC.

## Supabase migrations (TxLINE tables)

Run once on production (Supabase Dashboard → SQL Editor):

```bash
# or paste supabase/migrations/001_txline_tables.sql
node scripts/migrate-txline-tables.mjs
```

Requires `SUPABASE_SERVICE_ROLE_KEY` (and optionally `DATABASE_URL` for direct Postgres).

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add your keys (X auth, Supabase, `TXODDS_API_TOKEN`, Solana RPC and signer). No secrets are committed.

## Demo video

See [`docs/DEMO_VIDEO_SCRIPT.md`](docs/DEMO_VIDEO_SCRIPT.md) for a 60–90s judge walkthrough.
