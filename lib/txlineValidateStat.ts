import type { Idl, Program } from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { binaryFieldFromBase64 } from "./txBinaryProof";
import { dailyScoresMerkleRootsPda } from "./txlineProofDisplay";
import type { TxScoreStat } from "./txScoreStat";
import type {
  TxProofNode,
  TxScoreProofPayload,
  TxScoresStatValidation,
  TxScoresStatValidationV2,
} from "./txodds";

export type StatValidationResult = {
  index: number;
  stat: TxScoreStat;
  valid: boolean;
};

function toBytes32(value: string): number[] {
  return Array.from(binaryFieldFromBase64(value));
}

function toProofNodes(nodes: TxProofNode[]) {
  return nodes.map((node) => ({
    hash: toBytes32(node.hash),
    isRightSibling: node.isRightSibling,
  }));
}

/** Matches TxODDS validateStatV2 discretePredicates single equalTo pattern. */
export function equalToPredicate(value: number) {
  return {
    threshold: value,
    comparison: { equalTo: {} },
  };
}

export function statsAndProofsFromPayload(payload: TxScoreProofPayload): Array<{
  stat: TxScoreStat;
  statProof: TxProofNode[];
}> {
  const legacy = payload as TxScoresStatValidation;
  if (legacy.statToProve && legacy.statProof) {
    const rows: Array<{ stat: TxScoreStat; statProof: TxProofNode[] }> = [
      { stat: legacy.statToProve, statProof: legacy.statProof },
    ];
    if (legacy.statToProve2 && legacy.statProof2) {
      rows.push({ stat: legacy.statToProve2, statProof: legacy.statProof2 });
    }
    return rows;
  }

  const v2 = payload as TxScoresStatValidationV2;
  const stats = v2.statsToProve ?? [];
  const proofs = v2.statProofs ?? [];
  return stats.map((stat, index) => ({
    stat,
    statProof: proofs[index] ?? [],
  }));
}

export function buildFixtureSummary(payload: TxScoreProofPayload) {
  return {
    fixtureId: new BN(payload.summary.fixtureId),
    updateStats: {
      updateCount: payload.summary.updateStats.updateCount,
      minTimestamp: new BN(payload.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(payload.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: toBytes32(payload.summary.eventStatsSubTreeRoot),
  };
}

/** Simulate legacy validate_stat for each proved stat (our IDL matches TxODDS PDA + StatTerm shape). */
export async function validateStatsOnChain(
  program: Program<Idl>,
  payload: TxScoreProofPayload,
  dailyScoresPda: PublicKey,
): Promise<{ pass: boolean; results: StatValidationResult[] }> {
  const minTs = payload.summary.updateStats.minTimestamp;
  const fixtureSummary = buildFixtureSummary(payload);
  const fixtureProof = toProofNodes(payload.subTreeProof);
  const mainTreeProof = toProofNodes(payload.mainTreeProof);
  const eventStatRoot = toBytes32(payload.eventStatRoot);
  const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1_400_000,
  });

  const rows = statsAndProofsFromPayload(payload);
  const results: StatValidationResult[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const { stat, statProof } = rows[index]!;
    const isValid = await program.methods
      .validateStat(
        new BN(minTs),
        fixtureSummary,
        fixtureProof,
        mainTreeProof,
        equalToPredicate(stat.value),
        {
          statToProve: stat,
          eventStatRoot,
          statProof: toProofNodes(statProof),
        },
        null,
        null,
      )
      .accounts({
        dailyScoresMerkleRoots: dailyScoresPda,
      })
      .preInstructions([computeBudgetIx])
      .view();

    results.push({ index, stat, valid: Boolean(isValid) });
  }

  return {
    pass: results.length > 0 && results.every((row) => row.valid),
    results,
  };
}

export function dailyScoresPdaForPayload(payload: TxScoreProofPayload): PublicKey {
  return dailyScoresMerkleRootsPda(payload.summary.updateStats.minTimestamp);
}

export type OnChainValidationContext = {
  connection: Connection;
  payer: Keypair;
  program: Program<Idl>;
};

export async function createOnChainValidationContext(
  idl: Idl,
  payer: Keypair,
  rpc: string,
): Promise<OnChainValidationContext> {
  const anchor = await import("@coral-xyz/anchor");
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    { commitment: "confirmed" },
  );
  return {
    connection,
    payer,
    program: new anchor.Program(idl, provider),
  };
}
