import type { Fixture } from "@/app/data/fixtures";
import { fixtureDateTime } from "@/app/data/fixtures";
import { getMatchProof, getMatchState, getSupabaseAdminClient, saveMatchProof } from "@/app/lib/supabase";
import { isMatchScored } from "@/app/lib/supabase";
import { ensureMatchGoalsBackfilled } from "@/lib/backfillMatchGoals";
import {
  evaluateProofSemantics,
  statsFromProofPayload,
} from "./txScoreProofSemantics";
import {
  fetchScoreProof,
  fetchScoresSnapshot,
  isTxoddsConfigured,
  latestScoreEvent,
  resolveTxFixture,
  terminalScoreEventSeq,
  type TxScoreEvent,
} from "./txodds";

const TERMINAL_STATUS_IDS = new Set([5, 10, 13, 100]);

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

/** Fetch TxLINE stat-validation proof and persist — never throws. */
export async function fetchAndPersistMatchProof(
  mundialMatchId: number,
  fixture: Pick<Fixture, "home" | "away" | "date" | "time">,
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

    const kickoffMs = fixtureDateTime(fixture as Fixture).getTime();
    const txFixture = await resolveTxFixture(fixture.home, fixture.away, kickoffMs);
    if (!txFixture) {
      console.warn(
        `[match-proof] No TxLINE fixture for match ${mundialMatchId} (${fixture.home} vs ${fixture.away})`,
      );
      return { stored: false, reason: "no TxLINE fixture match" };
    }

    const events = await fetchScoresSnapshot(txFixture.FixtureId);
    const seq = terminalScoreEventSeq(events);
    if (seq == null) {
      console.info(
        `[match-proof] Terminal scores seq not ready for TxLINE fixture ${txFixture.FixtureId}`,
      );
      return { stored: false, reason: "terminal scores seq not ready" };
    }

    const result = await fetchScoreProof(txFixture.FixtureId, { seq });
    if (result.status === "not_yet_available") {
      console.info(
        `[match-proof] Proof not yet available for TxLINE fixture ${txFixture.FixtureId}: ${result.reason}`,
      );
      return { stored: false, reason: result.reason };
    }
    if (result.status === "error") {
      console.warn(
        `[match-proof] Proof fetch failed for match ${mundialMatchId}: ${result.message}`,
      );
      return { stored: false, reason: result.message };
    }

    const matchState = await getMatchState(mundialMatchId).catch(() => null);
    const settledHome = matchState?.final_home_score;
    const settledAway = matchState?.final_away_score;
    const homeIsP1 = txFixture.Participant1IsHome;
    const terminalId = terminalStatusId(events);

    let semanticsMismatch = false;
    let showVerifiedBadge = result.proofMode === "total";

    if (typeof settledHome === "number" && typeof settledAway === "number") {
      const evaluation = evaluateProofSemantics({
        stats: statsFromProofPayload(result.proof),
        statKeys: result.statKeys,
        settledHome,
        settledAway,
        homeIsP1,
        terminalStatusId: terminalId,
      });
      semanticsMismatch = evaluation.semanticsMismatch;
      showVerifiedBadge = evaluation.showVerifiedBadge;

      if (semanticsMismatch) {
        console.warn(
          `[match-proof] Semantics mismatch match ${mundialMatchId}: proven ${evaluation.provenHome ?? "?"}-${evaluation.provenAway ?? "?"} vs settled ${settledHome}-${settledAway}`,
        );
      }
    }

    const root = result.proof.summary.eventStatsSubTreeRoot;
    await saveMatchProof({
      fixtureId: mundialMatchId,
      txFixtureId: txFixture.FixtureId,
      seq: result.seq,
      statKeys: result.statKeys,
      proofPayload: result.proof,
      proofReference: root,
      proofTs: result.proof.ts,
      semanticsMismatch,
      showVerifiedBadge,
      proofMode: result.proofMode,
      terminalStatusId: terminalId,
    });

    console.info(
      `[match-proof] Stored proof for match ${mundialMatchId} (TxLINE ${txFixture.FixtureId}, seq ${result.seq}, mode ${result.proofMode})`,
    );
    return { stored: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[match-proof] Unexpected error for match ${mundialMatchId}:`,
      message,
    );
    return { stored: false, reason: message };
  }
}

/** Retry proof fetch for scored matches that have no stored proof yet. */
export async function retryMissingMatchProofs(
  fixtures: Fixture[],
): Promise<{ attempted: number; stored: number }> {
  if (!isTxoddsConfigured()) return { attempted: 0, stored: 0 };

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

  return { attempted, stored };
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
