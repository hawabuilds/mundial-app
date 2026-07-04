/**
 * Diagnose validate_stat FAIL for a TxLINE fixture — read-only, no patches.
 * Usage: npx tsx scripts/diagnose-proof-fail.ts <tx_fixture_id>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair } from "@solana/web3.js";
import idl from "../txodds/txoracle-devnet.json";
import { parseSolanaSecretKey } from "../lib/solanaKeypair";
import { binaryFieldFromBase64 } from "../lib/txBinaryProof";
import { dailyScoresMerkleRootsPda } from "../lib/txlineProofDisplay";
import {
  REGULATION_GOAL_STAT_KEYS,
  TOTAL_GOAL_STAT_KEYS,
  participantTotalsFromStats,
  statsFromProofPayload,
} from "../lib/txScoreProofSemantics";
import {
  fetchScoreProof,
  fetchScoresSnapshot,
  latestScoreEvent,
  terminalScoreEventSeq,
  type TxScoreEvent,
} from "../lib/txodds";

const TERMINAL_STATUS_IDS = new Set([5, 10, 13, 100]);

function terminalStatusId(events: TxScoreEvent[]): number | null {
  const terminal = events.filter(
    (e) => e.StatusId != null && TERMINAL_STATUS_IDS.has(e.StatusId),
  );
  if (terminal.length === 0) return null;
  return terminal.reduce((best, e) =>
    (e.Seq ?? -1) >= (best.Seq ?? -1) ? e : best,
  ).StatusId ?? null;
}

function regulationFromSnapshot(events: TxScoreEvent[]): {
  home: number;
  away: number;
} | null {
  const latest = latestScoreEvent(events);
  if (!latest?.Stats?.length) return null;
  const totals = participantTotalsFromStats(latest.Stats, "regulation");
  if (!totals) return null;
  const homeIsP1 = latest.Participant1IsHome !== false;
  return homeIsP1
    ? { home: totals.p1, away: totals.p2 }
    : { home: totals.p2, away: totals.p1 };
}

async function main() {
  const fixtureId = Number.parseInt(process.argv[2] ?? "", 10);
  if (!Number.isFinite(fixtureId)) {
    console.error("Usage: npx tsx scripts/diagnose-proof-fail.ts <tx_fixture_id>");
    process.exit(1);
  }

  console.log("=== TxLINE proof diagnosis ===");
  console.log("fixtureId:", fixtureId);

  const events = await fetchScoresSnapshot(fixtureId);
  console.log("\n--- Scores snapshot ---");
  console.log("event count:", events.length);
  const seq = terminalScoreEventSeq(events);
  const terminalId = terminalStatusId(events);
  const latest = latestScoreEvent(events);
  console.log("terminalScoreEventSeq:", seq);
  console.log("terminalStatusId:", terminalId);
  if (latest) {
    console.log("latest Seq:", latest.Seq, "StatusId:", latest.StatusId);
    console.log(
      "latest score (Goals/HomeScore fields):",
      JSON.stringify({
        HomeScore: (latest as { HomeScore?: number }).HomeScore,
        AwayScore: (latest as { AwayScore?: number }).AwayScore,
        StatsCount: latest.Stats?.length ?? 0,
      }),
    );
  }

  const settledReg = regulationFromSnapshot(events);
  console.log("regulation totals from latest snapshot Stats:", settledReg);

  if (latest?.Stats?.length) {
    console.log("\n--- All Stats on latest snapshot event ---");
    for (const stat of latest.Stats) {
      console.log(`  key=${stat.key} period=${stat.period} value=${stat.value}`);
    }
  }

  console.log("\n--- Regulation stat keys requested ---");
  console.log(REGULATION_GOAL_STAT_KEYS.join(", "));

  const regulation = await fetchScoreProof(fixtureId, {
    seq: seq ?? undefined,
    statKeys: [...REGULATION_GOAL_STAT_KEYS],
  });
  console.log("\n--- Regulation proof fetch ---");
  console.log("status:", regulation.status);
  if (regulation.status !== "ok") {
    console.log(
      "detail:",
      regulation.status === "error" ? regulation.message : regulation.reason,
    );
  } else {
    console.log("proofMode:", regulation.proofMode);
    console.log("seq used:", regulation.seq);
    console.log("statKeys:", regulation.statKeys.join(", "));
    const stats = statsFromProofPayload(regulation.proof);
    console.log("\n--- statsToProve (per key) ---");
    for (const key of REGULATION_GOAL_STAT_KEYS) {
      const match = stats.find(
        (s) => s.key === key || s.key === key % 1000 && s.period === key - (key % 1000),
      );
      const direct = stats.find((s) => s.key === key);
      console.log(
        `  composite ${key}:`,
        direct
          ? `key=${direct.key} period=${direct.period} value=${direct.value}`
          : match
            ? `alt key=${match.key} period=${match.period} value=${match.value}`
            : "MISSING",
      );
    }
    console.log("\nfull statsToProve:", JSON.stringify(stats, null, 2));
    const proofTotals = participantTotalsFromStats(stats, "regulation");
    console.log("regulation totals from proof stats:", proofTotals);

    const totalProof = await fetchScoreProof(fixtureId, {
      seq: regulation.seq,
      statKeys: [...TOTAL_GOAL_STAT_KEYS],
    });
    console.log("\n--- Total (keys 1,2) proof fetch ---");
    console.log("status:", totalProof.status);
    if (totalProof.status === "ok") {
      const tstats = statsFromProofPayload(totalProof.proof);
      console.log("statsToProve:", JSON.stringify(tstats, null, 2));
      console.log(
        "total from proof:",
        participantTotalsFromStats(tstats, "total"),
      );
    }

    console.log("\n--- On-chain validate_stat (regulation proof, stat[0] only) ---");
    const secret = parseSolanaSecretKey(
      process.env.SOLANA_OPERATOR_SECRET_KEY?.trim(),
    );
    if (!secret) {
      console.log("SKIP on-chain sim — SOLANA_OPERATOR_SECRET_KEY not set");
      return;
    }
    const payer = Keypair.fromSecretKey(secret);
    const rpc =
      process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
    const connection = new Connection(rpc, "confirmed");
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(payer),
      { commitment: "confirmed" },
    );
    const program = new anchor.Program(idl as anchor.Idl, provider);
    const payload = regulation.proof;
    const minTs = payload.summary.updateStats.minTimestamp;
    const dailyScoresPda = dailyScoresMerkleRootsPda(minTs);

    const toBytes32 = (value: string) =>
      Array.from(binaryFieldFromBase64(value));
    const toProofNodes = (nodes: { hash: string; isRightSibling: boolean }[]) =>
      nodes.map((n) => ({
        hash: toBytes32(n.hash),
        isRightSibling: n.isRightSibling,
      }));

    const v2 = payload as {
      statsToProve?: { key: number; period: number; value: number }[];
      statProofs?: { hash: string; isRightSibling: boolean }[][];
    };
    const stat = v2.statsToProve?.[0];
    const statProof = v2.statProofs?.[0];
    if (!stat || !statProof) {
      console.log("No statProofs[0] in payload");
      return;
    }

    console.log("minTimestamp:", minTs);
    console.log("daily_scores PDA:", dailyScoresPda.toBase58());
    console.log("eventStatsSubTreeRoot:", payload.summary.eventStatsSubTreeRoot);
    console.log("eventStatRoot:", payload.eventStatRoot);
    console.log("statToProve[0]:", JSON.stringify(stat));
    console.log(
      "predicate:",
      JSON.stringify({ threshold: 0, comparison: { greaterThan: {} } }),
    );

    const fixtureSummary = {
      fixtureId: new BN(payload.summary.fixtureId),
      updateStats: {
        updateCount: payload.summary.updateStats.updateCount,
        minTimestamp: new BN(minTs),
        maxTimestamp: new BN(payload.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: toBytes32(payload.summary.eventStatsSubTreeRoot),
    };

    const isValid = await program.methods
      .validateStat(
        new BN(minTs),
        fixtureSummary,
        toProofNodes(payload.subTreeProof),
        toProofNodes(payload.mainTreeProof),
        { threshold: 0, comparison: { greaterThan: {} } },
        {
          statToProve: stat,
          eventStatRoot: toBytes32(payload.eventStatRoot),
          statProof: toProofNodes(statProof),
        },
        null,
        null,
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
      ])
      .view();

    console.log("validate_stat result (stat[0] only):", isValid);

    console.log("\n--- Likely cause ---");
    if (settledReg && proofTotals) {
      const homeIsP1 = latest?.Participant1IsHome !== false;
      const proofHome = homeIsP1 ? proofTotals.p1 : proofTotals.p2;
      const proofAway = homeIsP1 ? proofTotals.p2 : proofTotals.p1;
      if (proofHome !== settledReg.home || proofAway !== settledReg.away) {
        console.log(
          `(c) Data mismatch: snapshot regulation ${settledReg.home}-${settledReg.away} vs proof ${proofHome}-${proofAway}`,
        );
      } else {
        console.log(
          "Proof stats match snapshot regulation score — failure may be (b) seq/root or Merkle path, not score semantics",
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
