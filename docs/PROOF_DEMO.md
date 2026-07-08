# TxLINE proof verification demo

Example output from the judge command for **Argentina vs Egypt** (TxFixtureId `18202701`, Mundial match 80). Run locally with `.env.local` configured (`TXODDS_API_TOKEN`, Solana devnet RPC):

```bash
npx tsx scripts/verify-proof.ts 18202701
```

## Sequence selection

- `game_finalised` record found in scores feed
- **seq chosen:** 1045 (`seq_source: game_finalised`)

## Official proof (stat keys 1, 2 — full-time total)

```json
[
  { "key": 1, "value": 3, "period": 100 },
  { "key": 2, "value": 2, "period": 100 }
]
```

**Totals:** P1 3 – P2 2 (Argentina 3, Egypt 2 after extra time).

## Regulation proof (stat keys 1001, 1002, 3001, 3002 — settlement basis)

```json
[
  { "key": 1001, "value": 0, "period": 100 },
  { "key": 1002, "value": 1, "period": 100 },
  { "key": 3001, "value": 3, "period": 100 },
  { "key": 3002, "value": 1, "period": 100 }
]
```

**Regulation totals:** P1 3 – P2 2 (H1+H2 only — Mundial scores predictions on this line).

## On-chain validation (devnet TxOracle)

Simulated via Anchor `validate_stat` + `equalTo` predicate against `daily_scores_roots` Merkle root:

| Proof | Result |
|-------|--------|
| Official (2 stats) | **PASS** |
| Regulation (4 stats) | **PASS** |

```
fixtureId: 18202701
seq: 1045
game_finalised found: true
official proof: PASS
regulation proof: PASS
```

Mundial stores both payloads in `match_proofs` and shows the **TxLINE verified** badge on the FT card only when the regulation proof matches the settled score in `match_state`.
