# Mundial — Community FAQ

Plain answers to common questions. Share this link with anyone new to the game.

**Play at:** [mundial.xyz](https://mundial.xyz)  
**Legal disclaimer:** [mundial.xyz/disclaimer](https://mundial.xyz/disclaimer)

---

## The basics

### What is Mundial?

A **free skill-based prediction game**. You reply on **X (Twitter)** with your score prediction before a match kicks off. You earn **points** when the final score is known. The **leaderboard** ranks everyone by total points. Each day, the **top 20** players can win a share of that day’s **BNB prize pool** — funded in part by **$SCORE** token taxes on BSC (see [$SCORE token](#score-token) below).

### Is this gambling?

No — it’s positioned as a **skill-based prediction game**, not a sportsbook or casino. Nothing on the site is financial or gambling advice. See the full [disclaimer](https://mundial.xyz/disclaimer). **Check your local laws** — eligibility varies by region.

### Is Mundial official FIFA / a league / a club?

**No.** We are **not affiliated** with FIFA, any league, or any club. We use public match schedules and scores for a fan prediction game.

### Do I need crypto or a wallet just to play?

**No.** You only need an **X account** to predict and earn points.

You need a **wallet** (MetaMask on BSC) **only when you want to claim BNB prizes** after you finish in the top 20.

---

## $SCORE token

### What is $SCORE?

**$SCORE** is the project token on **BNB Smart Chain (BSC)**. It was launched on **[flap.sh](https://flap.sh)**. Trading $SCORE is **separate from playing the game** — you do not need to hold or buy the token to predict or earn points.

**DYOR.** Token prices can go up or down. Nothing here is investment advice. See our [disclaimer](https://mundial.xyz/disclaimer).

### What are the taxes?

Every **buy** and every **sell** pays a **3% tax** (often written as **3/3** — 3% buy, 3% sell).

### Where do the taxes go?

All buy/sell taxes are split in two stages:

**Stage 1 — half of all taxes (50%)**

- **Buyback and burn** — half of total tax collected is used to buy $SCORE and **burn** it (reduce supply).

**Stage 2 — the other half (50%)**

- Goes to the **Flap split vault**. That remainder is split **80 / 20**:
  - **80%** → **daily leaderboard winner payouts** (BNB prizes for top-20 players)
  - **20%** → a **football charity**

Simple picture:

```
Every buy/sell tax (3%)
        │
        ├── 50% → buyback & burn $SCORE
        │
        └── 50% → Flap split vault
                      ├── 80% → leaderboard winners (daily)
                      └── 20% → football charity
```

### How does this connect to the game?

The **BNB you claim** as a top-20 winner comes from the payout system funded in part by this **80% share** of token taxes (along with any other BNB held for prizes). The better the token trades, the more tax can flow into prizes and charity — but **amounts vary every day** and are not guaranteed.

---
## How to play (step by step)

### 1. Sign in on the website

Go to [mundial.xyz](https://mundial.xyz) and **Sign in with X**. That links your game profile to your X account.

### 2. Find today’s matches

The **home page** and **dashboard** show upcoming fixtures for the current day (kickoff times are **UTC**).

### 3. Predict on X — not in the app

Predictions are **replies on X**, not typed into the website.

1. Open the match from the app (or find the post from **@MundialX**).
2. **Reply** to that match post with your predicted score **before kickoff**.
3. Include **both teams** and a score, for example:
   - `Netherlands 2-1 Uzbekistan`
   - `France 2 – 0 Northern Ireland`
   - `2-1 Netherlands` (team names near the numbers also work)

### 4. Wait for the final score

After the match, the app collects replies, settles the score, and updates **points** and the **leaderboard**.

### 5. Climb the leaderboard

Your **points add up across all matches** (season leaderboard). Higher total points = higher rank.

### 6. Win and claim (top 20 only)

Every day at **12:00 UTC**, we snapshot the **top 20** on the leaderboard. If you’re in that group, you can **claim BNB** from the **Claim** tab — after you **connect a wallet** on the Wallet tab.

---

## Predictions on X

### Which X account posts the matches?

Match threads are posted by **@MundialX** (unless we announce otherwise). Your reply must be on **that match post**, not a random tweet.

### When is the deadline?

**Before kickoff (UTC).** If your reply is posted at or after kickoff, it **does not count**.

Check the kickoff time on the app — all times are **UTC**.

### Can I change my prediction?

Your **first valid reply** on that match post (before kickoff) is the one that counts. Delete and repost before kickoff if you need to change it — only the first collected reply per X account is used.

### Why wasn’t my reply counted?

Common reasons:

| Problem | What to do |
|--------|------------|
| Replied **after kickoff** | Too late — predict earlier next time |
| Wrong thread (not the official match post) | Reply under **@MundialX**’s post for that fixture |
| Score format not recognized | Use both team names (or clear aliases) and digits, e.g. `2-1` |
| No match post yet | Wait for the post — we publish before kickoff |
| Match was cancelled | Void fixtures don’t score |

If you think we missed a valid reply, contact the team with your **X handle**, **match**, and **link to your reply**.

### Does extra time or penalties count?

**No.** We settle on the score after **90 minutes + injury time** only (same idea as most betting “full time” markets). Extra time and penalty shootouts **do not** change your points.

---

## Points and scoring

### How many points do I get?

| Result | Points |
|--------|--------|
| **Exact score** (e.g. you said 2–1 and it was 2–1) | **5** |
| **Correct outcome** (right winner or draw, wrong score) | **3** |
| **Wrong outcome** (wrong winner) | **1** (thanks for playing) |

You always get at least **1 point** if you had a valid pre-kickoff prediction and the match was scored.

When you get the **result right** (exact or correct winner/draw), your base is multiplied by the **locked TxLINE pre-kickoff market** — up to **×3** when you back the underdog (`min(3, 100 / implied %)`).

### When do points update?

After the match **finishes** and we have the **final 90+ injury time score**. This usually happens automatically within about **15 minutes of full time**. The leaderboard updates once points are saved — refresh the app if you don’t see them yet.

### How does the leaderboard work?

- **One row per player** (your X account).
- **Total points** = sum of points from every scored match you played.
- **Rank** = sorted by total points (higher is better).

The leaderboard is **ongoing across matches**, not reset every day.

---

## Prizes and BNB

### Who gets paid?

Only players in the **top 20** on the leaderboard at the **daily snapshot** (see below).

### When is the daily snapshot?

**Every day at 12:00 UTC.** We lock the top 20 at that moment. That group becomes eligible for **that calendar day’s** prize pool.

Example: snapshot on 8 June UTC → epoch id **20260608** → winners claim for “8 June” rewards.

### How big is the prize pool?

The pool is **whatever unreserved BNB is in the payout contract** at snapshot time (after reserving amounts still owed to earlier winners who haven’t claimed yet). It **changes every day** — there is no fixed guaranteed amount.

A major source of funding is **$SCORE token taxes** on BSC (see [$SCORE token](#score-token) above): **80%** of the half that goes through the Flap split vault is directed to **daily leaderboard payouts**. The team may also add BNB to the contract directly.

**More trading volume → more tax → potentially bigger daily pools** — but this is never guaranteed.

### How is the pool split?

Of that day’s pool:

| Rank | Share of the day’s pool |
|------|-------------------------|
| **1 – 3** | **~9.3%** each (Tier 1) |
| **4 – 10** | **~5.6%** each (Tier 2) |
| **11 – 20** | **~3.3%** each (Tier 3) |

Per-person ratio **10 : 6 : 3.5** across tiers (100% of pool). On a **$1,500** pool: about **$140** / **$84** / **$49** per winner.

All tiers together use **100%** of that day’s opened pool.

### Testnet vs real money

During testing, payouts may use **BSC Testnet** and **test BNB (tBNB)** — not real money. We’ll announce when prizes move to **mainnet** and real BNB. Always check the app and official announcements.

---

## Wallets and claiming

### How do I claim my reward?

1. **Sign in with X** (same account that was in the top 20).
2. Open **Wallet** → connect **MetaMask** (same browser, not QR WalletConnect if you can avoid it).
3. Switch MetaMask to **BSC Testnet** (chain id **97**) when we’re on testnet.
4. Open **Claim** → pick your day → **Claim**.
5. Confirm the transaction in MetaMask (you need a tiny amount of tBNB/BNB for **gas**).

### Why do I need to link a wallet?

Prizes are sent **on-chain** to the wallet you connect. We save that address linked to your X account so vouchers can’t be stolen by someone else.

### I’m in the top 20 but Claim is empty

Check:

- Did the **12:00 UTC snapshot** already run for that day?
- Are you signed in with the **same X account** that earned the points?
- Was the **epoch opened on-chain** and the contract **funded**? (If ops is still setting up, wait or ask in community.)

### Claim failed / “epoch not open” / “bad signature”

Usually an **ops/config** issue (epoch not opened, contract not funded, or server keys not matched to the contract). Try again later or ask the team — include the **day** you’re claiming and a **screenshot** of the error.

### Wrong network in MetaMask

Claims run on **BNB Smart Chain mainnet (56)**. Switch network in MetaMask and try again.

### I already claimed but don’t see BNB

- Check **testnet.bscscan.com** (testnet) or **bscscan.com** (mainnet) — not the wrong explorer.
- Look at the **wallet address you used when you claimed**, not a different MetaMask account.

---

## Website tabs (quick guide)

| Tab | What it’s for |
|-----|----------------|
| **Home** | Sign in, see today’s matches |
| **Dashboard** | Your rank, points, next matches, predict on X |
| **Ranks** | Full leaderboard |
| **Wallet** | Connect MetaMask for payouts |
| **Claim** | Claim BNB if you made top 20 |

Language: **English only**.

---

## Fair play and rules

### One account per person

Use **one X account** you control. Multi-account abuse can be disqualified at our discretion.

### No insider manipulation

Normal fan predictions only. Don’t try to break collection, spoof replies, or harass the team account.

### We can change fixtures

Friendlies, tests, and schedule changes happen. Cancelled matches don’t award points.

---

## For the team / operators (not players)

<details>
<summary>Technical snapshot (click to expand)</summary>

- Predictions: replies to @MundialX match posts, collected after kickoff.
- Scoring: `lib/scoring.ts` — 5 / 3 / 1 points.
- Settlement score: 90+ injury time only (`fullTime` from API).
- Snapshot cron: `0 12 * * *` UTC → top 20 → `payout_epochs` + on-chain `openEpoch`.
- Payout contract: **ScorePayout** on BSC; vouchers signed server-side; claims via `claim()` on-chain.
- $SCORE: BSC token on flap.sh; 3/3 tax; 50% buyback/burn, 50% Flap split vault → 80% leaderboard / 20% charity.
- Ops scripts: `scripts/verify-payout-contract.ts`, `scripts/diagnose-payout-epoch.ts`, `scripts/sync-fixtures.ts`.

</details>

---

## Still stuck?

Post in the community with:

1. Your **@X handle**
2. **Match** (teams + date)
3. **Link to your reply** (if prediction issue)
4. **Screenshot** (if claim/wallet issue)

We’ll help when we can — be patient on match days; collection and scoring run automatically after full time.

**Disclaimer:** Skill-based prediction game. Not financial advice. Eligibility varies by region. [Full disclaimer →](https://mundial.xyz/disclaimer)
