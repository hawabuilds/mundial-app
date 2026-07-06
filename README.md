# Copa Mundial

Score-prediction game on X (Twitter): reply with a scoreline before kickoff, earn points from accuracy and market odds, climb a cumulative leaderboard. Daily snapshot at 10:00 UTC locks the top 20 for USDC payout on Solana.

Live at [copamundial.app](https://copamundial.app).

![Copa Mundial — landing and leaderboard](docs/screenshots/cover.png)

## How it works

- Reply to a match thread on X with a scoreline before kickoff — your first valid reply is the one that counts.
- Points from every match add to your season total on the leaderboard.
- A daily snapshot at **10:00 UTC** locks the top 20 and opens on-chain USDC claims.

## Built on TxLINE

[TxLINE](https://txline.txodds.com/documentation/worldcup) (TxOdds) supplies fixtures, live scores, odds, stat-validation proofs, and historical score sequences.

**Documentation:** [TxLINE World Cup API](https://txline.txodds.com/documentation/worldcup)

### Auth

1. **Guest JWT** — `POST /auth/guest/start`, refreshed automatically.
2. **API token** — `X-Api-Token` from activation (`txodds/get-txodds-key.mjs` → `TXODDS_API_TOKEN`).

```
Authorization: Bearer <guest jwt>
X-Api-Token:   <activated api token>
```

### TxLINE integration — five surfaces

1. **GET /api/fixtures/snapshot** — schedule + kickoff for the live board (`lib/txScheduleBoard.ts`).
2. **GET /api/scores/snapshot/{fixtureId}** — live score, clock, status, goal events; terminal-status settlement on regulation 90+stoppage basis (`lib/txMatchSettlement.ts`, `lib/scoreFinishedMatches.ts`).
3. **GET /api/odds/snapshot/{fixtureId}** — pre-kickoff 1X2 implied %, locked first-fetch-wins to `match_odds` for the upset multiplier (`lib/ensureMatchOdds.ts`).
4. **GET /api/scores/stat-validation** — dual Merkle proofs per settled match: official result at the `game_finalised` record (statKeys=1,2) + regulation settlement basis (statKeys=1001,1002,3001,3002) (`lib/matchProofFetch.ts`).
5. **GET /api/scores/historical/{fixtureId}** — full score-update replay, used to backfill `match_goals` after post-FT snapshot trimming (`lib/backfillMatchGoals.ts`).

Live goal events during a match accumulate in `match_goals` via the scores feed (`lib/matchGoalsPersist.ts`). `match_goals` is not used for odds locking.

### Scoring formula

**Accuracy base** (best tier only — one score per match):

| Tier | Base points |
|------|-------------|
| Exact scoreline | 5 |
| Correct result (win/draw/loss) | 3 |
| Played (wrong result) | 1 |

**Market multiplier** (locked `match_odds` 1X2, only when exact or result is correct):

```
multiplier = min(3, 100 / impliedPct)
points     = round(base × multiplier)
```

Implementation: `lib/scoring.ts`.

### Settlement proofs

After a match settles via TxLINE, the scoring cron fetches stat-validation proofs and stores them in `match_proofs` (`lib/matchProofFetch.ts`). Each row holds two payloads: an **official** proof at the `game_finalised` event (stat keys 1 and 2) and a **regulation** proof at the settlement basis (stat keys 1001, 1002, 3001, 3002). Mundial scores on the regulation total.

Event **seq** selection prefers the `game_finalised` record from the scores feed. If only a terminal whistle proof is available at first fetch, the row is stored with `seq_source=terminal_fallback` and upgraded when the finalised proof arrives (self-healing within 24 hours).

The **TxLINE verified** badge on an FT card is shown only when the regulation proof exactly matches the settled score in `match_state`. Any mismatch suppresses the badge (`evaluateProofSemantics` in `lib/txScoreProofSemantics.ts`).

On-chain verification is wired: proofs are checked against the TxOracle `daily_scores_roots` Merkle root for the batch day via the `validate_stat` instruction (`lib/txlineValidateStat.ts`, IDL in `txodds/txoracle-devnet.json`), aligned with TxODDS' published devnet examples.

Judge command:

```bash
npx tsx scripts/verify-proof.ts <txFixtureId>
```

## Stack

- Next.js (App Router) + TypeScript
- TxLINE — fixtures, scores, odds, proofs
- Supabase (Postgres) — predictions, `match_odds`, `match_goals`, snapshots, payout epochs
- NextAuth (X provider)
- Solana + USDC — signed claim vouchers, operator-opened epochs
- Vercel — crons for kickoff collection, scoring, daily snapshot

## Smart contract

Anchor program in [`solana-program/`](solana-program/). Operator opens each epoch with a USDC pot; server signs per-winner vouchers; `claim` checks ed25519 + keccak message hash on-chain before transfer.

**Devnet program ID:** `2GvW9gBcFmmUcoQDoBVQe9rpR1dGzD4uTdaLzzwRzRz9` (`declare_id!` in `solana-program/programs/state/src/lib.rs`).

### On-chain evidence (devnet)

| Action | Explorer |
|--------|----------|
| **Open epoch** (`OpenEpoch`) | [321wRsoCqZno98QZzUiagHjigVfXHKwmBnpe57c6nfEQt5cW6D8dNzQDyjiQ1EYuMc4uRapABtzEonhd7AzbyiLo](https://explorer.solana.com/tx/321wRsoCqZno98QZzUiagHjigVfXHKwmBnpe57c6nfEQt5cW6D8dNzQDyjiQ1EYuMc4uRapABtzEonhd7AzbyiLo?cluster=devnet) |
| **USDC claim** (`Claim`) | [3KzPYxmnCebQ2Andavj828RyTwEPEv6dcT5hkxB8cLoTVshmySEyAmhxpNaa3CCnUqqyJyVqmw9u73JeCbBgQd4A](https://explorer.solana.com/tx/3KzPYxmnCebQ2Andavj828RyTwEPEv6dcT5hkxB8cLoTVshmySEyAmhxpNaa3CCnUqqyJyVqmw9u73JeCbBgQd4A?cluster=devnet) |

### Live usage (devnet)

Queried 2026-07-06 against production Supabase (`tzzbrqoarusrlrpvooyn.supabase.co`) and devnet claim markers.

- **Predictions stored:** 0
- **Distinct leaderboard players:** 0 (users with scored points)
- **Matches settled via TxLINE:** 0
- **Proofs in `match_proofs`:** 0
- **On-chain epochs opened:** 1
- **Claims executed (on-chain markers):** 1

## Database setup

Apply migrations in order on a fresh Supabase project (Dashboard → SQL Editor, paste each file), or use the helper scripts where noted.

| Order | File | Notes |
|-------|------|-------|
| 1 | `supabase/schema.sql` | Base tables: predictions, match_state, payout_epochs, leaderboard_snapshots |
| 2 | `supabase/migrations/001_txline_tables.sql` | Or `node scripts/migrate-txline-tables.mjs` |
| 3 | `supabase/migrations/20260704000000_match_goals.sql` | Goal accumulation table |
| 4 | `supabase/migrations/20260704153000_lock_rls.sql` | Remove anon write on `predictions` / `match_state` |
| 5 | `supabase/migrations/20260704160000_match_proofs.sql` | Base proof storage |
| 6 | `supabase/migrations/20260704163000_match_proofs_semantics.sql` | Semantics columns |
| 7 | `supabase/migrations/20260704170000_match_proofs_dual.sql` | Official + regulation payloads |

Steps 5–7 can also run via `npx tsx scripts/apply-match-proofs-migrations.ts` when `DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is set.

Requires `SUPABASE_SERVICE_ROLE_KEY` for app and migration scripts.

## Supabase access model

The browser does not write to Postgres directly.

```
Browser  →  fetch("/api/…")  →  Next.js route / cron  →  getSupabaseAdminClient()  →  Postgres
```

- **Client:** `/api/matches`, `/api/leaderboard`, `/api/me/leaderboard-stats`
- **Server:** collection, scoring, snapshots, claims — `SUPABASE_SERVICE_ROLE_KEY`
- **RLS:** reward tables have no anon/authenticated write policies (step 4 above)

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` (X auth, Supabase, `TXODDS_API_TOKEN`, Solana RPC and signer keys). No secrets are committed.

## Devnet payout demo

Requires `SOLANA_RPC_URL` containing `devnet`, operator/signer keys, and a funded rewards vault.

```bash
npm run demo:epoch -- --pot 2000
npm run e2e:solana-claim -- <epochId>
```

`open:solana-epoch` opens an on-chain epoch manually (positional args, no devnet guard).

Test suites: `npm run test:solana-voucher` and other `test:*` scripts in `package.json`.

Goal and proof maintenance:

```bash
npm run backfill:goals
npx tsx scripts/verify-proof.ts <txFixtureId>
```

## Demo video

[`docs/DEMO_VIDEO_SCRIPT.md`](docs/DEMO_VIDEO_SCRIPT.md) — ~3–4 minute walkthrough.

## License

MIT — see [LICENSE](LICENSE).
