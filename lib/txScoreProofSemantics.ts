import type { TxScoreStat } from "./txScoreStat";

/**
 * Soccer feed stat period encoding (TxLINE Soccer Feed → Stat Period Encoding):
 * composite stat key = period_multiplier + base_key, where base 1/2 = P1/P2 goals.
 *
 * Documented multipliers:
 * - H1: +1000 → 1001 / 1002
 * - H2: +2000 → 2001 / 2002 (docs)
 *
 * Live scores feed in this repo decodes H2 as +3000 (see lib/txodds PERIOD_GOAL_STAT_BASES).
 * Regulation proof requests use 1001, 1002, 3001, 3002 to match observed play-by-play stats.
 */
export const SOCCER_GOAL_BASE = {
  PARTICIPANT_1: 1,
  PARTICIPANT_2: 2,
} as const;

export const SOCCER_PERIOD_MULTIPLIER = {
  H1: 1000,
  /** Docs list +2000 for H2; feed uses +3000 — regulation keys follow the feed. */
  H2_FEED: 3000,
  H2_DOCS: 2000,
  ET1: 4000,
  ET2: 5000,
} as const;

/** Observed in devnet stat-validation responses for full-time total goals. */
export const SOCCER_TOTAL_PERIOD_CODE = 100;

export const REGULATION_GOAL_STAT_KEYS = [
  SOCCER_PERIOD_MULTIPLIER.H1 + SOCCER_GOAL_BASE.PARTICIPANT_1,
  SOCCER_PERIOD_MULTIPLIER.H1 + SOCCER_GOAL_BASE.PARTICIPANT_2,
  SOCCER_PERIOD_MULTIPLIER.H2_FEED + SOCCER_GOAL_BASE.PARTICIPANT_1,
  SOCCER_PERIOD_MULTIPLIER.H2_FEED + SOCCER_GOAL_BASE.PARTICIPANT_2,
] as const;

export const TOTAL_GOAL_STAT_KEYS = [
  SOCCER_GOAL_BASE.PARTICIPANT_1,
  SOCCER_GOAL_BASE.PARTICIPANT_2,
] as const;

export const TERMINAL_STATUS_ID = {
  FT: 5,
  AET: 10,
  FPE: 13,
} as const;

export type ProofScoreMode = "regulation" | "total";

export function isRegulationStatKeySet(statKeys: readonly number[]): boolean {
  if (statKeys.length !== REGULATION_GOAL_STAT_KEYS.length) return false;
  const expected = new Set<number>(REGULATION_GOAL_STAT_KEYS);
  return statKeys.every((key) => expected.has(key));
}

export function statValueForComposite(
  stats: readonly TxScoreStat[],
  compositeKey: number,
): number | null {
  const base = compositeKey % 1000;
  const periodMultiplier = compositeKey - base;

  for (const stat of stats) {
    if (stat.key === compositeKey) return stat.value;
    if (stat.key === base && stat.period === periodMultiplier) return stat.value;
  }
  return null;
}

export function statValueForTotal(
  stats: readonly TxScoreStat[],
  participantBase: number,
): number | null {
  for (const stat of stats) {
    if (stat.key === participantBase && stat.period === SOCCER_TOTAL_PERIOD_CODE) {
      return stat.value;
    }
    if (stat.key === participantBase && stat.period === 0) return stat.value;
  }
  return null;
}

export function participantTotalsFromStats(
  stats: readonly TxScoreStat[],
  mode: ProofScoreMode,
): { p1: number; p2: number } | null {
  if (mode === "regulation") {
    const p1h1 = statValueForComposite(stats, REGULATION_GOAL_STAT_KEYS[0]);
    const p2h1 = statValueForComposite(stats, REGULATION_GOAL_STAT_KEYS[1]);
    const p1h2 = statValueForComposite(stats, REGULATION_GOAL_STAT_KEYS[2]);
    const p2h2 = statValueForComposite(stats, REGULATION_GOAL_STAT_KEYS[3]);
    if (p1h1 == null || p2h1 == null || p1h2 == null || p2h2 == null) return null;
    return { p1: p1h1 + p1h2, p2: p2h1 + p2h2 };
  }

  const p1 = statValueForTotal(stats, SOCCER_GOAL_BASE.PARTICIPANT_1);
  const p2 = statValueForTotal(stats, SOCCER_GOAL_BASE.PARTICIPANT_2);
  if (p1 == null || p2 == null) return null;
  return { p1, p2 };
}

export function mapParticipantTotalsToHomeAway(
  totals: { p1: number; p2: number },
  homeIsP1: boolean,
): { homeScore: number; awayScore: number } {
  return homeIsP1
    ? { homeScore: totals.p1, awayScore: totals.p2 }
    : { homeScore: totals.p2, awayScore: totals.p1 };
}

export function statsFromProofPayload(payload: unknown): TxScoreStat[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.statsToProve)) {
    return record.statsToProve as TxScoreStat[];
  }
  const stats: TxScoreStat[] = [];
  if (record.statToProve && typeof record.statToProve === "object") {
    stats.push(record.statToProve as TxScoreStat);
  }
  if (record.statToProve2 && typeof record.statToProve2 === "object") {
    stats.push(record.statToProve2 as TxScoreStat);
  }
  return stats;
}

export function proofScoreMode(statKeys: readonly number[]): ProofScoreMode {
  return isRegulationStatKeySet(statKeys) ? "regulation" : "total";
}

export function endedAfterRegulation(terminalStatusId: number | null | undefined): boolean {
  return (
    terminalStatusId === TERMINAL_STATUS_ID.AET ||
    terminalStatusId === TERMINAL_STATUS_ID.FPE
  );
}

export function evaluateProofSemantics(input: {
  stats: readonly TxScoreStat[];
  statKeys: readonly number[];
  settledHome: number;
  settledAway: number;
  homeIsP1: boolean;
  terminalStatusId: number | null;
}): {
  semanticsMismatch: boolean;
  showVerifiedBadge: boolean;
  proofMode: ProofScoreMode;
  provenHome: number | null;
  provenAway: number | null;
} {
  const mode = proofScoreMode(input.statKeys);
  const totals = participantTotalsFromStats(input.stats, mode);
  if (!totals) {
    return {
      semanticsMismatch: true,
      showVerifiedBadge: false,
      proofMode: mode,
      provenHome: null,
      provenAway: null,
    };
  }

  const proven = mapParticipantTotalsToHomeAway(totals, input.homeIsP1);
  const semanticsMismatch =
    proven.homeScore !== input.settledHome || proven.awayScore !== input.settledAway;

  if (mode === "regulation") {
    return {
      semanticsMismatch,
      showVerifiedBadge: !semanticsMismatch,
      proofMode: mode,
      provenHome: proven.homeScore,
      provenAway: proven.awayScore,
    };
  }

  const regulationFinish = input.terminalStatusId === TERMINAL_STATUS_ID.FT;
  return {
    semanticsMismatch,
    showVerifiedBadge: regulationFinish && !semanticsMismatch,
    proofMode: mode,
    provenHome: proven.homeScore,
    provenAway: proven.awayScore,
  };
}

export function proofPopoverCopy(proofMode: ProofScoreMode): string {
  if (proofMode === "regulation") {
    return "Regulation (90-min) goals cryptographically proven via TxLINE on-chain Merkle roots.";
  }
  return "Final-score total goals anchored on-chain by TxLINE.";
}
