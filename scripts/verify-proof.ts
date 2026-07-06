import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import type { Idl } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import idl from "../txodds/txoracle-devnet.json";
import { parseSolanaSecretKey } from "../lib/solanaKeypair";
import {
  REGULATION_GOAL_STAT_KEYS,
  TOTAL_GOAL_STAT_KEYS,
  participantTotalsFromStats,
  statsFromProofPayload,
} from "../lib/txScoreProofSemantics";
import { resolveProofEventSeq } from "../lib/txScoreEventSeq";
import {
  createOnChainValidationContext,
  dailyScoresPdaForPayload,
  validateStatsOnChain,
} from "../lib/txlineValidateStat";
import {
  fetchScoreProof,
  fetchScoresSnapshot,
  type TxScoreProofPayload,
} from "../lib/txodds";

type CliArgs = {
  fixtureId: number;
  payerPath: string | null;
};

function parseCliArgs(argv: string[]): CliArgs {
  let fixtureId: number | null = null;
  let payerPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--payer") {
      const next = argv[i + 1];
      if (!next) {
        console.error("--payer requires a path to a keypair JSON file");
        process.exit(1);
      }
      payerPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
    const parsed = Number.parseInt(arg, 10);
    if (Number.isFinite(parsed)) {
      fixtureId = parsed;
    }
  }

  if (fixtureId == null) {
    console.error(
      "Usage: npx tsx scripts/verify-proof.ts <tx_fixture_id> [--payer <path-to-keypair-json>]",
    );
    process.exit(1);
  }

  return { fixtureId, payerPath };
}

function loadPayerKeypair(payerPath: string | null): Keypair {
  if (payerPath) {
    const raw = fs.readFileSync(payerPath, "utf8");
    const secret = parseSolanaSecretKey(raw.trim());
    if (!secret) {
      throw new Error(`Keypair file is empty or invalid: ${payerPath}`);
    }
    return Keypair.fromSecretKey(secret);
  }

  const secret = parseSolanaSecretKey(
    process.env.SOLANA_OPERATOR_SECRET_KEY?.trim(),
  );
  if (!secret) {
    throw new Error(
      "SOLANA_OPERATOR_SECRET_KEY is not set — set it in .env.local or pass --payer",
    );
  }
  return Keypair.fromSecretKey(secret);
}

function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

async function ensurePayerFunded(
  connection: Connection,
  payer: Keypair,
  rpc: string,
): Promise<void> {
  let lamports = await connection.getBalance(payer.publicKey, "confirmed");
  console.log(`Payer balance: ${formatSol(lamports)} SOL`);
  if (lamports > 0) return;

  if (!rpc.includes("devnet")) {
    throw new Error(
      `Payer ${payer.publicKey.toBase58()} has 0 SOL and airdrop is only attempted on devnet RPC`,
    );
  }

  console.log("Payer unfunded — requesting devnet airdrop (last resort)...");
  const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
  lamports = await connection.getBalance(payer.publicKey, "confirmed");
  console.log(`Payer balance after airdrop: ${formatSol(lamports)} SOL`);
  if (lamports === 0) {
    throw new Error("Airdrop confirmed but balance is still 0");
  }
}

function printProofStats(label: string, payload: TxScoreProofPayload, statKeys: number[]) {
  const stats = statsFromProofPayload(payload);
  console.log(`\n--- ${label} ---`);
  console.log("statsToProve:", JSON.stringify(stats, null, 2));
  const mode = statKeys.every((key) =>
    (TOTAL_GOAL_STAT_KEYS as readonly number[]).includes(key),
  )
    ? "total"
    : "regulation";
  const totals = participantTotalsFromStats(stats, mode);
  console.log(`${mode} totals (P1/P2):`, totals);
}

async function verifyPayloadOnChain(
  label: string,
  payload: TxScoreProofPayload,
  ctx: Awaited<ReturnType<typeof createOnChainValidationContext>>,
): Promise<boolean> {
  const dailyScoresPda = dailyScoresPdaForPayload(payload);
  const dailyAcct = await ctx.connection.getAccountInfo(dailyScoresPda);
  if (!dailyAcct) {
    console.log(`BLOCKED  ${label}: daily_scores_merkle_roots missing`);
    console.log("         PDA:", dailyScoresPda.toBase58());
    return false;
  }

  try {
    const outcome = await validateStatsOnChain(ctx.program, payload, dailyScoresPda);
    for (const row of outcome.results) {
      console.log(
        `  stat[${row.index}] key=${row.stat.key} period=${row.stat.period} value=${row.stat.value} equalTo → ${row.valid ? "PASS" : "FAIL"}`,
      );
    }
    console.log(`${label} on-chain: ${outcome.pass ? "PASS" : "FAIL"}`);
    return outcome.pass;
  } catch (error) {
    console.log(`${label} on-chain: FAIL (simulation error)`);
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
}

async function main(): Promise<void> {
  const { fixtureId, payerPath } = parseCliArgs(process.argv.slice(2));

  console.log("=== TxLINE verify-proof ===");
  console.log("fixtureId:", fixtureId);

  const events = await fetchScoresSnapshot(fixtureId);
  const seqResolution = resolveProofEventSeq(events);
  console.log("\n--- Sequence selection ---");
  console.log("game_finalised record exists:", seqResolution.gameFinalisedFound);
  console.log("seq chosen:", seqResolution.seq);
  console.log("seq source:", seqResolution.source ?? "none");

  if (seqResolution.seq == null) {
    console.log("BLOCKED  No game_finalised or terminal seq in snapshot");
    process.exit(1);
  }

  const official = await fetchScoreProof(fixtureId, {
    seq: seqResolution.seq,
    statKeys: [...TOTAL_GOAL_STAT_KEYS],
  });
  const regulation = await fetchScoreProof(fixtureId, {
    seq: seqResolution.seq,
    statKeys: [...REGULATION_GOAL_STAT_KEYS],
  });

  console.log("\n--- Official proof (statKeys=1,2) ---");
  console.log("fetch status:", official.status);
  if (official.status === "ok") {
    printProofStats("Official stats", official.proof, official.statKeys);
  } else {
    console.log(
      "detail:",
      official.status === "error" ? official.message : official.reason,
    );
  }

  console.log("\n--- Regulation proof (1001,1002,3001,3002) ---");
  console.log("fetch status:", regulation.status);
  if (regulation.status === "ok") {
    printProofStats("Regulation stats", regulation.proof, regulation.statKeys);
  } else {
    console.log(
      "detail:",
      regulation.status === "error" ? regulation.message : regulation.reason,
    );
  }

  let payer: Keypair;
  try {
    payer = loadPayerKeypair(payerPath);
  } catch (error) {
    console.log("\nBLOCKED on-chain sim:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const rpc =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com";
  console.log("\n--- On-chain validation (validate_stat + equalTo per stat) ---");
  console.log("RPC:", rpc);
  console.log("Payer:", payer.publicKey.toBase58());
  console.log(
    "Note: TxODDS examples use validateStatV2 + NDimensionalStrategy; bundled IDL exposes validate_stat only — predicates aligned via equalTo thresholds.",
  );

  const connection = new Connection(rpc, "confirmed");
  try {
    await ensurePayerFunded(connection, payer, rpc);
  } catch (error) {
    console.log("BLOCKED", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const ctx = await createOnChainValidationContext(idl as Idl, payer, rpc);
  console.log("program:", ctx.program.programId.toBase58());

  let officialPass = false;
  let regulationPass = false;

  if (official.status === "ok") {
    officialPass = await verifyPayloadOnChain(
      "Official (finalised) proof",
      official.proof,
      ctx,
    );
  }

  if (regulation.status === "ok") {
    regulationPass = await verifyPayloadOnChain(
      "Regulation (settlement) proof",
      regulation.proof,
      ctx,
    );
  }

  console.log("\n=== Summary ===");
  console.log("fixtureId:", fixtureId);
  console.log("seq:", seqResolution.seq);
  console.log("game_finalised found:", seqResolution.gameFinalisedFound);
  console.log(
    "official proof:",
    official.status === "ok" ? (officialPass ? "PASS" : "FAIL") : official.status,
  );
  console.log(
    "regulation proof:",
    regulation.status === "ok"
      ? regulationPass
        ? "PASS"
        : "FAIL"
      : regulation.status,
  );

  const exitOk = official.status === "ok" ? officialPass : regulationPass;
  process.exit(exitOk ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
