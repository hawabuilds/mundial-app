import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime, getFixtureById } from "@/app/data/fixtures";
import {
  getMatchProof,
  getMatchState,
  getSupabaseAdminClient,
  isMatchScored,
  listTerminalFallbackMatchProofs,
  saveMatchProof,
  type StoredMatchProof,
} from "@/app/lib/supabase";
import { ensureMatchGoalsBackfilled } from "@/lib/backfillMatchGoals";
import {
  evaluateProofSemantics,
  REGULATION_GOAL_STAT_KEYS,
  statsFromProofPayload,
  TOTAL_GOAL_STAT_KEYS,
} from "./txScoreProofSemantics";
import {
  resolveProofEventSeqFromSources,
  type GameFinalisedDiscoverySource,
  type ResolvedProofEventSeq,
} from "./txScoreEventSeq";
import {
  fetchScoreProof,
  fetchScoreSequence,
  fetchScoresSnapshot,
  isTxoddsConfigured,
  latestScoreEvent,
  resolveTxFixture,
  type TxFixture,
  type TxScoreEvent,
} from "./txodds";

const TERMINAL_STATUS_IDS = new Set([5, 10, 13, 100]);

/** Stop retrying terminal_fallback upgrades this long after the proof was first stored. */
export const TERMINAL_FALLBACK_UPGRADE_MAX_MS = 24 * 60 * 60 * 1000;

function terminalStatusId(events: TxScoreEvent[]): number | null {
  const terminal = events.filter(
    (event) => event.StatusId != null && TERMINAL_STATUS_IDS.has(event.StatusId),
  );
  if (terminal.length === 0) return null;
  const latest = terminal.reduce((best, event) =>
    (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
  );
  return latest.StatusId ?? null;
}

type FixtureForProof = Pick<
  Fixture,
  "home" | "away" | "date" | "time" | "externalFixtureId"
>;

function txFixtureFromScoresFeed(
  txFixtureId: number,
  fixture: FixtureForProof,
  events: TxScoreEvent[],
): TxFixture {
  const kickoffMs = fixtureDateTime(fixture as Fixture).getTime();
  const anchor =
    latestScoreEvent(events) ??
    events.reduce((best, event) =>
      (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
    );
  const meta = anchor as {
    Participant1IsHome?: boolean;
    StartTime?: number;
    Competition?: string;
  };
  const lineups = events.find((event) => event.Lineups?.length);
  const names =
    lineups?.Lineups?.map((team) => team.preferredName?.trim()).filter(Boolean) ??
    [];
  const p1Home = meta.Participant1IsHome !== false;
  const p1 = names[0] ?? fixture.home;
  const p2 = names[1] ?? fixture.away;

  return {
    Ts: 0,
    FixtureId: txFixtureId,
    StartTime: meta.StartTime ?? kickoffMs,
    Competition: meta.Competition ?? "World Cup",
    CompetitionId: 0,
    FixtureGroupId: 0,
    Participant1Id: 0,
    Participant1: p1Home ? p1 : p2,
    Participant2Id: 0,
    Participant2: p1Home ? p2 : p1,
    Participant1IsHome: p1Home,
  };
}

/** Resolve TxLINE fixture by snapshot lookup, then registry externalFixtureId + scores feed. */
export async function resolveTxFixtureForMatch(
  fixture: FixtureForProof,
): Promise<TxFixture | null> {
  const kickoffMs = fixtureDateTime(fixture as Fixture).getTime();
  const fromSnapshot = await resolveTxFixture(fixture.home, fixture.away, kickoffMs);
  if (fromSnapshot) return fromSnapshot;

  const txFixtureId = fixture.externalFixtureId;
  if (txFixtureId == null || txFixtureId <= 0) return null;

  const events = await fetchScoresSnapshot(txFixtureId).catch(() => []);
  if (events.length === 0) return null;

  return txFixtureFromScoresFeed(txFixtureId, fixture, events);
}

async function loadScoreEventsForProof(txFixtureId: number): Promise<{
  snapshot: TxScoreEvent[];
  historical: TxScoreEvent[];
}> {
  const snapshot = await fetchScoresSnapshot(txFixtureId);
  let historical: TxScoreEvent[] = [];
  if (resolveProofEventSeqFromSources(snapshot, []).source !== "game_finalised") {
    historical = await fetchScoreSequence(txFixtureId).catch(() => []);
  }
  return { snapshot, historical };
}

type DualProofFetchResult = {
  officialResult: Awaited<ReturnType<typeof fetchScoreProof>>;
  regulationResult: Awaited<ReturnType<typeof fetchScoreProof>>;
};

async function fetchDualProofsAtSeq(
  txFixtureId: number,
  proofSeq: number,
): Promise<DualProofFetchResult> {
  const [officialResult, regulationResult] = await Promise.all([
    fetchScoreProof(txFixtureId, {
      seq: proofSeq,
      statKeys: [...TOTAL_GOAL_STAT_KEYS],
    }),
    fetchScoreProof(txFixtureId, {
      seq: proofSeq,
      statKeys: [...REGULATION_GOAL_STAT_KEYS],
    }),
  ]);
  return { officialResult, regulationResult };
}

async function persistDualProof(input: {
  mundialMatchId: number;
  txFixture: TxFixture;
  proofSeq: number;
  seqResolution: ResolvedProofEventSeq;
  events: TxScoreEvent[];
  dual: DualProofFetchResult;
  preserveOnPartialFailure?: StoredMatchProof | null;
}): Promise<{ stored: boolean; reason?: string }> {
  const { regulationResult, officialResult } = input.dual;

  if (regulationResult.status !== "ok") {
    const detail =
      regulationResult.status === "error"
        ? regulationResult.message
        : regulationResult.reason;
    return { stored: false, reason: detail };
  }

  const preserve = input.preserveOnPartialFailure;
  const officialPayload =
    officialResult.status === "ok"
      ? officialResult.proof
      : (preserve?.officialPayload ?? null);
  const officialSeq =
    officialResult.status === "ok"
      ? officialResult.seq
      : (preserve?.officialSeq ?? input.proofSeq);
  const officialStatKeys =
    officialResult.status === "ok"
      ? officialResult.statKeys
      : (preserve?.officialStatKeys ?? []);

  if (officialResult.status !== "ok") {
    console.warn(
      `[match-proof] Official proof missing for TxLINE ${input.txFixture.FixtureId}: ${
        officialResult.status === "error"
          ? officialResult.message
          : officialResult.reason
      }`,
    );
  }

  const matchState = await getMatchState(input.mundialMatchId).catch(() => null);
  const settledHome = matchState?.final_home_score;
  const settledAway = matchState?.final_away_score;
  const homeIsP1 = input.txFixture.Participant1IsHome;
  const terminalId = terminalStatusId(input.events);

  let semanticsMismatch = false;
  let showVerifiedBadge = false;

  if (typeof settledHome === "number" && typeof settledAway === "number") {
    const evaluation = evaluateProofSemantics({
      stats: statsFromProofPayload(regulationResult.proof),
      statKeys: regulationResult.statKeys,
      settledHome,
      settledAway,
      homeIsP1,
      terminalStatusId: terminalId,
    });
    semanticsMismatch = evaluation.semanticsMismatch;
    showVerifiedBadge = evaluation.showVerifiedBadge;

    if (semanticsMismatch) {
      console.warn(
        `[match-proof] Semantics mismatch match ${input.mundialMatchId}: proven ${evaluation.provenHome ?? "?"}-${evaluation.provenAway ?? "?"} vs settled ${settledHome}-${settledAway}`,
      );
    }
  }

  const root = regulationResult.proof.summary.eventStatsSubTreeRoot;
  await saveMatchProof({
    fixtureId: input.mundialMatchId,
    txFixtureId: input.txFixture.FixtureId,
    seq: regulationResult.seq,
    statKeys: regulationResult.statKeys,
    proofPayload: regulationResult.proof,
    proofReference: root,
    proofTs: regulationResult.proof.ts,
    semanticsMismatch,
    showVerifiedBadge,
    proofMode: "regulation",
    terminalStatusId: terminalId,
    officialPayload,
    regulationPayload: regulationResult.proof,
    officialSeq,
    regulationSeq: regulationResult.seq,
    officialStatKeys,
    regulationStatKeys: regulationResult.statKeys,
    seqSource: input.seqResolution.source,
  });

  return { stored: true };
}

/** Fetch TxLINE stat-validation proof and persist — never throws. */
export async function fetchAndPersistMatchProof(
  mundialMatchId: number,
  fixture: FixtureForProof,
  options?: { force?: boolean },
): Promise<{ stored: boolean; reason?: string }> {
  try {
    if (!isTxoddsConfigured()) {
      return { stored: false, reason: "TXODDS_API_TOKEN not configured" };
    }

    if (await isMatchScored(mundialMatchId).catch(() => false)) {
      await ensureMatchGoalsBackfilled(mundialMatchId, fixture);
    }

    const existing = await getMatchProof(mundialMatchId).catch(() => null);
    if (existing && !options?.force) {
      return { stored: false, reason: "proof already stored" };
    }

    if (existing && options?.force) {
      const supabase = getSupabaseAdminClient();
      await supabase.from("match_proofs").delete().eq("fixture_id", mundialMatchId);
    }

    const txFixture = await resolveTxFixtureForMatch(fixture);
    if (!txFixture) {
      console.warn(
        `[match-proof] No TxLINE fixture for match ${mundialMatchId} (${fixture.home} vs ${fixture.away})`,
      );
      return { stored: false, reason: "no TxLINE fixture match" };
    }

    const { snapshot, historical } = await loadScoreEventsForProof(txFixture.FixtureId);
    const seqResolution = resolveProofEventSeqFromSources(snapshot, historical);
    if (seqResolution.seq == null) {
      console.info(
        `[match-proof] Scores seq not ready for TxLINE fixture ${txFixture.FixtureId}`,
      );
      return { stored: false, reason: "scores seq not ready" };
    }

    if (seqResolution.source === "terminal_fallback") {
      console.warn(
        `[match-proof] No game_finalised record for TxLINE ${txFixture.FixtureId}; using terminal StatusId fallback seq ${seqResolution.seq}`,
      );
    } else if (seqResolution.gameFinalisedIn === "historical") {
      console.info(
        `[match-proof] game_finalised for TxLINE ${txFixture.FixtureId} found in historical sequence (seq ${seqResolution.seq})`,
      );
    }

    const dual = await fetchDualProofsAtSeq(txFixture.FixtureId, seqResolution.seq);
    const mergedEvents = [...snapshot, ...historical];
    const result = await persistDualProof({
      mundialMatchId,
      txFixture,
      proofSeq: seqResolution.seq,
      seqResolution,
      events: mergedEvents.length > 0 ? mergedEvents : snapshot,
      dual,
    });

    if (result.stored) {
      const stored = await getMatchProof(mundialMatchId).catch(() => null);
      console.info(
        `[match-proof] Stored dual proof for match ${mundialMatchId} (TxLINE ${txFixture.FixtureId}, seq ${seqResolution.seq}, source ${seqResolution.source}, badge ${stored?.showVerifiedBadge ?? "?"})`,
      );
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[match-proof] Unexpected error for match ${mundialMatchId}:`,
      message,
    );
    return { stored: false, reason: message };
  }
}

export type TerminalFallbackUpgradeResult = {
  attempted: number;
  upgraded: number;
  skippedExpired: number;
  stillWaiting: number;
};

/**
 * Re-anchor terminal_fallback proofs when game_finalised later appears in snapshot or historical feed.
 */
export async function upgradeTerminalFallbackProofs(
  now: Date = new Date(),
): Promise<TerminalFallbackUpgradeResult> {
  if (!isTxoddsConfigured()) {
    return { attempted: 0, upgraded: 0, skippedExpired: 0, stillWaiting: 0 };
  }

  const proofs = await listTerminalFallbackMatchProofs().catch(() => [] as StoredMatchProof[]);
  const nowMs = now.getTime();
  let attempted = 0;
  let upgraded = 0;
  let skippedExpired = 0;
  let stillWaiting = 0;

  for (const proof of proofs) {
    const ageMs = nowMs - Date.parse(proof.fetchedAt);
    if (!Number.isFinite(ageMs) || ageMs > TERMINAL_FALLBACK_UPGRADE_MAX_MS) {
      skippedExpired += 1;
      continue;
    }

    attempted += 1;

    const { snapshot, historical } = await loadScoreEventsForProof(proof.txFixtureId);
    const discovered = resolveProofEventSeqFromSources(snapshot, historical);
    if (discovered.source !== "game_finalised" || discovered.seq == null) {
      stillWaiting += 1;
      continue;
    }

    const foundIn = discovered.gameFinalisedIn as GameFinalisedDiscoverySource;
    console.info(
      `[match-proof] Upgrading terminal_fallback for match ${proof.fixtureId} (TxLINE ${proof.txFixtureId}): game_finalised seq ${discovered.seq} found in ${foundIn}`,
    );

    const fixture = getFixtureById(proof.fixtureId);
    if (!fixture) {
      console.warn(
        `[match-proof] Upgrade skipped — unknown registry match ${proof.fixtureId}`,
      );
      stillWaiting += 1;
      continue;
    }

    const txFixture =
      (await resolveTxFixtureForMatch(fixture)) ??
      txFixtureFromScoresFeed(
        proof.txFixtureId,
        fixture,
        [...snapshot, ...historical].length > 0 ? [...snapshot, ...historical] : snapshot,
      );
    if (!txFixture) {
      stillWaiting += 1;
      continue;
    }

    const dual = await fetchDualProofsAtSeq(proof.txFixtureId, discovered.seq);
    const mergedEvents = [...snapshot, ...historical];
    const result = await persistDualProof({
      mundialMatchId: proof.fixtureId,
      txFixture,
      proofSeq: discovered.seq,
      seqResolution: discovered,
      events: mergedEvents.length > 0 ? mergedEvents : snapshot,
      dual,
      preserveOnPartialFailure: proof,
    });

    if (result.stored) {
      upgraded += 1;
      console.info(
        `[match-proof] Upgraded match ${proof.fixtureId} to game_finalised seq ${discovered.seq} (source ${foundIn})`,
      );
    } else {
      console.warn(
        `[match-proof] Upgrade refetch failed for match ${proof.fixtureId}; kept prior proof (${result.reason ?? "unknown"})`,
      );
      stillWaiting += 1;
    }
  }

  return { attempted, upgraded, skippedExpired, stillWaiting };
}

/** Retry proof fetch for scored matches that have no stored proof yet. */
export async function retryMissingMatchProofs(
  fixtures: Fixture[],
): Promise<{
  attempted: number;
  stored: number;
  upgrade: TerminalFallbackUpgradeResult;
}> {
  if (!isTxoddsConfigured()) {
    return {
      attempted: 0,
      stored: 0,
      upgrade: { attempted: 0, upgraded: 0, skippedExpired: 0, stillWaiting: 0 },
    };
  }

  let attempted = 0;
  let stored = 0;

  for (const fixture of fixtures) {
    if (!(await isMatchScored(fixture.id))) continue;
    if (await getMatchProof(fixture.id).catch(() => null)) continue;

    attempted += 1;
    const before = await getMatchProof(fixture.id).catch(() => null);
    await fetchAndPersistMatchProof(fixture.id, fixture);
    const after = await getMatchProof(fixture.id).catch(() => null);
    if (!before && after) stored += 1;
  }

  const upgrade = await upgradeTerminalFallbackProofs();

  return { attempted, stored, upgrade };
}

/** Terminal status from scores snapshot (for board UI when match_state absent). */
export async function readTerminalStatusId(txFixtureId: number): Promise<number | null> {
  try {
    const events = await fetchScoresSnapshot(txFixtureId);
    return terminalStatusId(events) ?? latestScoreEvent(events)?.StatusId ?? null;
  } catch {
    return null;
  }
}
