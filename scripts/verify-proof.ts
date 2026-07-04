import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import idl from "../txodds/txoracle-devnet.json";
import {
  getMatchProof,
  getMatchProofByTxFixtureId,
} from "../app/lib/supabase";
import { parseSolanaSecretKey } from "../lib/solanaKeypair";
import { binaryFieldFromBase64 } from "../lib/txBinaryProof";
import { dailyScoresMerkleRootsPda } from "../lib/txlineProofDisplay";
import {
  fetchScoreProof,
  type TxProofNode,
  type TxScoresStatValidation,
  type TxScoresStatValidationV2,
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
      "Usage: npx tsx scripts/verify-proof.ts <fixture_id> [--payer <path-to-keypair-json>]",
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
      "SOLANA_OPERATOR_SECRET_KEY is not set — set it in .env.local or pass --payer <path-to-keypair-json>",
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
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    lamports = await connection.getBalance(payer.publicKey, "confirmed");
    console.log(`Payer balance after airdrop: ${formatSol(lamports)} SOL`);
    if (lamports === 0) {
      throw new Error("Airdrop confirmed but balance is still 0");
    }
  } catch (airdropError) {
    throw new Error(
      `Devnet airdrop failed (balance was 0 SOL): ${
        airdropError instanceof Error ? airdropError.message : airdropError
      }`,
    );
  }
}

function toBytes32(value: string): number[] {
  return Array.from(binaryFieldFromBase64(value));
}

function toProofNodes(nodes: TxProofNode[]) {
  return nodes.map((node) => ({
    hash: toBytes32(node.hash),
    isRightSibling: node.isRightSibling,
  }));
}

async function loadProofPayload(
  fixtureId: number,
): Promise<TxScoresStatValidation | TxScoresStatValidationV2> {
  const stored =
    (await getMatchProof(fixtureId).catch(() => null)) ??
    (await getMatchProofByTxFixtureId(fixtureId).catch(() => null));

  if (stored) {
    return stored.proofPayload as TxScoresStatValidation | TxScoresStatValidationV2;
  }

  const live = await fetchScoreProof(fixtureId);
  if (live.status !== "ok") {
    throw new Error(
      live.status === "error"
        ? live.message
        : `Proof not available: ${live.reason}`,
    );
  }
  return live.proof;
}

async function main(): Promise<void> {
  const { fixtureId, payerPath } = parseCliArgs(process.argv.slice(2));

  let payer: Keypair;
  try {
    payer = loadPayerKeypair(payerPath);
  } catch (error) {
    console.log("BLOCKED", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const rpc =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com";
  console.log("RPC:", rpc);
  console.log("Payer:", payer.publicKey.toBase58());

  const connection = new Connection(rpc, "confirmed");
  try {
    await ensurePayerFunded(connection, payer, rpc);
  } catch (error) {
    console.log("BLOCKED", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let payload: TxScoresStatValidation | TxScoresStatValidationV2;
  try {
    payload = await loadProofPayload(fixtureId);
  } catch (error) {
    console.log("BLOCKED", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" },
  );
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, provider);
  const programId = program.programId;
  const minTs = payload.summary.updateStats.minTimestamp;

  const fixtureSummary = {
    fixtureId: new BN(payload.summary.fixtureId),
    updateStats: {
      updateCount: payload.summary.updateStats.updateCount,
      minTimestamp: new BN(payload.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(payload.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: toBytes32(payload.summary.eventStatsSubTreeRoot),
  };

  const fixtureProof = toProofNodes(payload.subTreeProof);
  const mainTreeProof = toProofNodes(payload.mainTreeProof);

  const legacy = payload as TxScoresStatValidation;
  const v2 = payload as TxScoresStatValidationV2;
  const stat =
    legacy.statToProve ??
    v2.statsToProve?.[0] ??
    (() => {
      throw new Error("Proof payload has no statToProve / statsToProve");
    })();

  const statProofNodes =
    legacy.statProof ??
    v2.statProofs?.[0] ??
    (() => {
      throw new Error("Proof payload has no statProof / statProofs");
    })();

  const stat1 = {
    statToProve: stat,
    eventStatRoot: toBytes32(payload.eventStatRoot),
    statProof: toProofNodes(statProofNodes),
  };

  const predicate = {
    threshold: 0,
    comparison: { greaterThan: {} },
  };

  const dailyScoresPda = dailyScoresMerkleRootsPda(minTs);

  const dailyAcct = await connection.getAccountInfo(dailyScoresPda);
  if (!dailyAcct) {
    console.log("BLOCKED  daily_scores_merkle_roots account missing on RPC");
    console.log("         PDA:", dailyScoresPda.toBase58());
    console.log("         RPC:", rpc);
    process.exit(1);
  }

  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000,
  });

  try {
    const builder = program.methods
      .validateStat(
        new BN(minTs),
        fixtureSummary,
        fixtureProof,
        mainTreeProof,
        predicate,
        stat1,
        null,
        null,
      )
      .accounts({
        dailyScoresMerkleRoots: dailyScoresPda,
      })
      .preInstructions([computeBudgetIx]);

    const isValid = await builder.view();

    if (isValid) {
      console.log("PASS  On-chain validate_stat simulation succeeded");
      console.log("      program:", programId.toBase58());
      console.log("      daily_scores PDA:", dailyScoresPda.toBase58());
      process.exit(0);
    }

    console.log("FAIL  validate_stat returned false (predicate rejected)");
    process.exit(1);
  } catch (error) {
    console.log("FAIL  validate_stat simulation error");
    const err = error as Error & {
      logs?: string[];
      error?: { errorMessage?: string };
      simulationResponse?: { err?: unknown; logs?: string[] };
    };
    if (err.simulationResponse?.err === "AccountNotFound") {
      console.log(
        "BLOCKED  RPC simulate could not resolve an account (daily_scores PDA exists:",
        dailyScoresPda.toBase58(),
        ")",
      );
    }
    const message =
      err?.message ||
      err?.error?.errorMessage ||
      (typeof error === "string" ? error : "");
    if (message) console.error(message);
    if (Array.isArray(err.logs) && err.logs.length > 0) {
      console.error(err.logs.join("\n"));
    }
    const simLogs = err.simulationResponse?.logs;
    if (Array.isArray(simLogs) && simLogs.length > 0) {
      console.error(simLogs.join("\n"));
    }
    if (err.simulationResponse?.err) {
      console.error("simulation err:", JSON.stringify(err.simulationResponse.err));
    }
    if (!message && (!err.logs || err.logs.length === 0)) {
      console.error(JSON.stringify(error, Object.getOwnPropertyNames(error as object)));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
