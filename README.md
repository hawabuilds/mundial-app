# Copa Mundial

A football score-prediction game built around X (Twitter). You reply to a match post with your predicted scoreline before kickoff and earn points based on how close you get. Each day the top 20 on the leaderboard split a USDC prize pool that's paid out on Solana.

Live at [copamundial.app](https://copamundial.app).

## How it works

- Reply to a match thread on X with a scoreline before kickoff — your first valid reply is the one that counts.
- Scoring: 5 points for an exact score, 3 for the correct result, 1 for taking part.
- The leaderboard resets every 3 days so newer players still have a realistic shot at the top.
- A daily snapshot at 10:00 UTC locks in the top 20 and opens on-chain USDC claims.

## Stack

- Next.js (App Router) + TypeScript
- Supabase (Postgres) for users, predictions, and standings
- NextAuth with the X provider for sign-in
- Solana + USDC for payouts — signed claim vouchers against an operator-opened payout epoch
- next-intl for translations, CSS Modules for styling
- Vercel, with cron routes for kickoff collection, scoring, and the daily snapshot

## The parts that took the most work

- Pulling the first valid reply per user out of the X API and staying inside rate limits around kickoff.
- Settling scores when a fixture's kickoff collection got missed — falling back to the final result instead of dropping the round.
- Sizing each day's payout pot from on-chain balance minus already-reserved funds, so the total claimable can never exceed what the vault actually holds.

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add your own keys (X auth, Supabase, Solana RPC and signer). No secrets are committed.
