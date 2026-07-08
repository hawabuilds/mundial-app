import {
  formatPlayerFullName,
  formatPlayerShortName,
} from "./playerDisplayName";
import type { TxScoreEvent } from "./txodds";

export const PENALTY_SHOOTOUT_STATUS_IDS = new Set([11, 12, 13]);

export type PenaltyKickOutcome = "scored" | "missed" | "saved" | "unknown";

export type PenaltyKick = {
  side: "home" | "away";
  player: string | null;
  playerShort: string | null;
  outcome: PenaltyKickOutcome;
  /** 1-based kick index for this team. */
  teamKick: number;
  /** TxLINE Seq — used to merge stable kick rows across polls. */
  seq: number;
};

export type PenaltyShootout = {
  homeScore: number;
  awayScore: number;
  inProgress: boolean;
  kicks: PenaltyKick[];
  /** Score after 120 minutes (before shootout). */
  aetHome: number | null;
  aetAway: number | null;
};

export type PenaltyRound = {
  round: number;
  home: PenaltyKick | null;
  away: PenaltyKick | null;
};

export function isPenaltyShootoutStatusId(statusId: number): boolean {
  return PENALTY_SHOOTOUT_STATUS_IDS.has(statusId);
}

export function parsePenaltyKickOutcome(raw: unknown): PenaltyKickOutcome {
  const value = String(raw ?? "").toLowerCase();
  if (value === "scored" || value === "goal") return "scored";
  if (value === "missed" || value === "miss" || value === "bar") return "missed";
  if (value === "saved" || value === "save") return "saved";
  return "unknown";
}

function lineupNameById(events: TxScoreEvent[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const event of events) {
    if (event.Action !== "lineups" || !event.Lineups) continue;
    for (const team of event.Lineups) {
      for (const row of team.lineups ?? []) {
        const id = row.player?.normativeId;
        const name = row.player?.preferredName;
        if (id != null && name) map.set(id, name);
      }
    }
  }
  return map;
}

type ParticipantPlayerStats = Record<string, Record<string, number>>;

function participantPlayerStats(
  event: TxScoreEvent,
  participant: 1 | 2,
): ParticipantPlayerStats | undefined {
  const key = participant === 2 ? "Participant2" : "Participant1";
  return event.PlayerStats?.[key];
}

function namesFromPreferred(
  preferred: string,
): { player: string | null; playerShort: string | null } {
  return {
    player: formatPlayerFullName(preferred),
    playerShort: formatPlayerShortName(preferred),
  };
}

function playerFromData(
  data: Record<string, unknown> | undefined,
  nameById: Map<number, string>,
): { player: string | null; playerShort: string | null } {
  if (!data) return { player: null, playerShort: null };
  const inline =
    typeof data.PreferredName === "string"
      ? data.PreferredName
      : typeof data.PlayerName === "string"
        ? data.PlayerName
        : null;
  const pid = typeof data.PlayerId === "number" ? data.PlayerId : null;
  const preferred = inline ?? (pid != null ? nameById.get(pid) : undefined);
  if (!preferred) return { player: null, playerShort: null };
  return namesFromPreferred(preferred);
}

/** Miss/save takers sometimes only appear in PlayerStats (attempts up, goals flat). */
function playerFromPenaltyStatsDelta(
  baseline: ParticipantPlayerStats | undefined,
  current: ParticipantPlayerStats | undefined,
  knownScorerIds: ReadonlySet<number>,
  nameById: Map<number, string>,
): { player: string | null; playerShort: string | null } {
  if (!current) return { player: null, playerShort: null };

  for (const [pidStr, stats] of Object.entries(current)) {
    const pid = Number(pidStr);
    if (!Number.isFinite(pid) || knownScorerIds.has(pid)) continue;

    const prev = baseline?.[pidStr] ?? {};
    const attempts = stats.penaltyAttempts ?? 0;
    const prevAttempts = prev.penaltyAttempts ?? 0;
    const goals = stats.penaltyGoals ?? 0;
    const prevGoals = prev.penaltyGoals ?? 0;

    if (attempts > prevAttempts && goals <= prevGoals) {
      const preferred = nameById.get(pid);
      if (preferred) return namesFromPreferred(preferred);
    }
  }

  return { player: null, playerShort: null };
}

function mergePlayerFields(
  primary: { player: string | null; playerShort: string | null },
  fallback: { player: string | null; playerShort: string | null },
): { player: string | null; playerShort: string | null } {
  return {
    player: primary.player ?? fallback.player,
    playerShort: primary.playerShort ?? fallback.playerShort,
  };
}

function shootoutStartSeq(events: TxScoreEvent[]): number {
  let start = Number.POSITIVE_INFINITY;
  for (const event of events) {
    if (event.StatusId === 11 || event.StatusId === 12) {
      start = Math.min(start, event.Seq ?? Number.POSITIVE_INFINITY);
    }
  }
  if (start !== Number.POSITIVE_INFINITY) return start;

  let aetSeq = -1;
  for (const event of events) {
    if (event.StatusId === 10 || event.StatusId === 100) {
      aetSeq = Math.max(aetSeq, event.Seq ?? -1);
    }
  }
  if (aetSeq < 0) return Number.POSITIVE_INFINITY;

  for (const event of events) {
    if ((event.Seq ?? 0) <= aetSeq) continue;
    if (event.Action === "penalty_outcome") return event.Seq ?? aetSeq + 1;
    if (event.Action === "action_amend") {
      const amend = event.Data as { Action?: string } | undefined;
      if (amend?.Action === "penalty_outcome") return event.Seq ?? aetSeq + 1;
    }
  }
  return Number.POSITIVE_INFINITY;
}

type RawShootoutKick = {
  seq: number;
  participant: 1 | 2;
  outcome: PenaltyKickOutcome;
  player: string | null;
  playerShort: string | null;
};

function collectShootoutKicks(
  events: TxScoreEvent[],
  startSeq: number,
): RawShootoutKick[] {
  const sorted = [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
  const nameById = lineupNameById(sorted);
  const kicks: RawShootoutKick[] = [];
  const penStatsBaseline: Partial<Record<1 | 2, ParticipantPlayerStats>> = {};
  const knownScorerIds: Record<1 | 2, Set<number>> = {
    1: new Set(),
    2: new Set(),
  };

  const upsertKick = (kick: RawShootoutKick) => {
    const existingIdx = kicks.findIndex(
      (row) => row.participant === kick.participant && row.seq === kick.seq,
    );
    if (existingIdx >= 0) {
      kicks[existingIdx] = kick;
      return;
    }
    kicks.push(kick);
  };

  const amendLastForParticipant = (
    participant: 1 | 2,
    updates: Pick<RawShootoutKick, "outcome" | "player" | "playerShort">,
  ) => {
    for (let i = kicks.length - 1; i >= 0; i--) {
      if (kicks[i]?.participant === participant) {
        kicks[i] = {
          ...kicks[i]!,
          outcome: updates.outcome,
          player: updates.player ?? kicks[i]!.player,
          playerShort: updates.playerShort ?? kicks[i]!.playerShort,
        };
        return;
      }
    }
  };

  const rememberScorer = (
    participant: 1 | 2,
    data: Record<string, unknown> | undefined,
  ) => {
    const pid = typeof data?.PlayerId === "number" ? data.PlayerId : null;
    if (pid != null) knownScorerIds[participant].add(pid);
  };

  const resolveKickPlayer = (
    participant: 1 | 2,
    data: Record<string, unknown> | undefined,
    event: TxScoreEvent,
    outcome: PenaltyKickOutcome,
  ) => {
    const fromData = playerFromData(data, nameById);
    if (fromData.player) return fromData;

    if (outcome === "missed" || outcome === "saved") {
      return playerFromPenaltyStatsDelta(
        penStatsBaseline[participant],
        participantPlayerStats(event, participant),
        knownScorerIds[participant],
        nameById,
      );
    }

    return fromData;
  };

  for (const event of sorted) {
    if ((event.Seq ?? 0) < startSeq) continue;

    if (event.Action === "penalty_shootout_team") {
      const participant: 1 | 2 = event.Participant === 2 ? 2 : 1;
      penStatsBaseline[participant] = participantPlayerStats(event, participant) ?? {};
      continue;
    }

    if (event.Action === "penalty_outcome") {
      const data = event.Data as Record<string, unknown> | undefined;
      const participant: 1 | 2 = event.Participant === 2 ? 2 : 1;
      const outcome = parsePenaltyKickOutcome(data?.Outcome);
      const { player, playerShort } = resolveKickPlayer(
        participant,
        data,
        event,
        outcome,
      );
      upsertKick({
        seq: event.Seq ?? 0,
        participant,
        outcome,
        player,
        playerShort,
      });
      if (outcome === "scored") rememberScorer(participant, data);
      continue;
    }

    if (event.Action !== "action_amend") continue;
    const amend = event.Data as
      | { Action?: string; New?: Record<string, unknown> }
      | undefined;
    if (amend?.Action !== "penalty_outcome" || !amend.New) continue;

    const participant: 1 | 2 =
      amend.New.Participant === 2
        ? 2
        : amend.New.Participant === 1
          ? 1
          : event.Participant === 2
            ? 2
            : 1;
    const outcome = parsePenaltyKickOutcome(amend.New.Outcome);
    const { player, playerShort } = mergePlayerFields(
      playerFromData(amend.New, nameById),
      outcome === "missed" || outcome === "saved"
        ? playerFromPenaltyStatsDelta(
            penStatsBaseline[participant],
            participantPlayerStats(event, participant),
            knownScorerIds[participant],
            nameById,
          )
        : { player: null, playerShort: null },
    );
    amendLastForParticipant(participant, {
      outcome,
      player,
      playerShort,
    });
    if (outcome === "scored") rememberScorer(participant, amend.New);
  }

  return collapsePenaltyReplayDuplicates(kicks.sort((a, b) => a.seq - b.seq));
}

function rawKickQuality(kick: RawShootoutKick): number {
  let score = kick.outcome !== "unknown" ? 4 : 0;
  if (kick.player) score += 2;
  return score;
}

/** TxLINE scores/updates replays the same kick on new seq rows as scorer names arrive. */
function collapsePenaltyReplayDuplicates(kicks: RawShootoutKick[]): RawShootoutKick[] {
  const collapsed: RawShootoutKick[] = [];
  for (const kick of kicks) {
    const prev = collapsed[collapsed.length - 1];
    if (prev?.participant === kick.participant) {
      const keep =
        rawKickQuality(kick) > rawKickQuality(prev)
          ? kick
          : rawKickQuality(kick) < rawKickQuality(prev)
            ? prev
            : kick.seq >= prev.seq
              ? kick
              : prev;
      collapsed[collapsed.length - 1] = keep;
      continue;
    }
    collapsed.push(kick);
  }
  return collapsed;
}

function aetScoreFromEvents(
  events: TxScoreEvent[],
  homeIsP1: boolean,
): { home: number | null; away: number | null } {
  let last: TxScoreEvent | null = null;
  for (const event of events) {
    if (event.StatusId === 10 || event.StatusId === 100) {
      if (!last || (event.Seq ?? 0) >= (last.Seq ?? 0)) last = event;
    }
  }
  if (!last?.Stats) return { home: null, away: null };

  const p1 = statTotal(last, 1);
  const p2 = statTotal(last, 2);
  if (p1 == null || p2 == null) return { home: null, away: null };
  return homeIsP1 ? { home: p1, away: p2 } : { home: p2, away: p1 };
}

/** TxLINE Stats 6001/6002 = penalty-shootout goals for P1/P2 on the latest PEN-phase row. */
export function penShootoutTallyFromStats(
  events: TxScoreEvent[],
  homeIsP1: boolean,
): { home: number; away: number } | null {
  let best: TxScoreEvent | null = null;
  for (const event of events) {
    if (event.StatusId !== 11 && event.StatusId !== 12 && event.StatusId !== 13) {
      continue;
    }
    const p1 = event.Stats?.["6001"];
    const p2 = event.Stats?.["6002"];
    if (typeof p1 !== "number" || typeof p2 !== "number") continue;
    if (!best || (event.Seq ?? -1) >= (best.Seq ?? -1)) best = event;
  }
  if (!best?.Stats) return null;
  const p1 = best.Stats["6001"];
  const p2 = best.Stats["6002"];
  if (typeof p1 !== "number" || typeof p2 !== "number") return null;
  return homeIsP1 ? { home: p1, away: p2 } : { home: p2, away: p1 };
}

export function matchEndedViaPenalties(events: TxScoreEvent[]): boolean {
  if (events.some((event) => event.StatusId === 13)) return true;
  const tally = penShootoutTallyFromStats(events, true);
  if (!tally) {
    const tallySwapped = penShootoutTallyFromStats(events, false);
    return tallySwapped != null && tallySwapped.home + tallySwapped.away > 0;
  }
  return tally.home + tally.away > 0;
}

function statTotal(event: TxScoreEvent, participant: 1 | 2): number | null {
  const total = event.Stats?.[String(participant)];
  if (typeof total === "number") return total;
  const h1 = event.Stats?.[String(1000 + participant)] ?? 0;
  const h2 = event.Stats?.[String(3000 + participant)] ?? 0;
  const et1 = event.Stats?.[String(4000 + participant)] ?? 0;
  const et2 = event.Stats?.[String(5000 + participant)] ?? 0;
  if (
    event.Stats?.[String(1000 + participant)] == null &&
    event.Stats?.[String(3000 + participant)] == null &&
    event.Stats?.[String(4000 + participant)] == null &&
    event.Stats?.[String(5000 + participant)] == null
  ) {
    return null;
  }
  return h1 + h2 + et1 + et2;
}

function kickSlotKey(kick: Pick<PenaltyKick, "side" | "seq">): string {
  return `${kick.side}|${kick.seq}`;
}

function tallyFromKicks(kicks: PenaltyKick[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const kick of kicks) {
    if (kick.outcome !== "scored") continue;
    if (kick.side === "home") home += 1;
    else away += 1;
  }
  return { home, away };
}

function assignTeamKicks(kicks: PenaltyKick[]): PenaltyKick[] {
  const sorted = [...kicks].sort((a, b) => a.seq - b.seq);
  let homeCount = 0;
  let awayCount = 0;
  return sorted.map((kick) => ({
    ...kick,
    teamKick: kick.side === "home" ? ++homeCount : ++awayCount,
  }));
}

function mapRawKicksToPenaltyKicks(
  rawKicks: RawShootoutKick[],
  homeIsP1: boolean,
): PenaltyKick[] {
  const mapped = rawKicks.map((kick) => {
    const side: "home" | "away" =
      kick.participant === 1
        ? homeIsP1
          ? "home"
          : "away"
        : homeIsP1
          ? "away"
          : "home";
    return {
      side,
      player: kick.player,
      playerShort: kick.playerShort,
      outcome: kick.outcome,
      teamKick: 0,
      seq: kick.seq,
    };
  });
  return assignTeamKicks(mapped);
}

function kickQuality(kick: PenaltyKick): number {
  let score = 0;
  if (kick.outcome !== "unknown") score += 4;
  if (kick.player) score += 2;
  return score;
}

function pickBetterKick(a: PenaltyKick, b: PenaltyKick): PenaltyKick {
  const qa = kickQuality(a);
  const qb = kickQuality(b);
  if (qb > qa) return b;
  if (qa > qb) return a;
  return b.seq >= a.seq ? b : a;
}

/** Merge poll snapshots so kicks never flicker or downgrade on feed replay. */
export function mergePenaltyShootout(
  prev: PenaltyShootout | null | undefined,
  next: PenaltyShootout | null | undefined,
): PenaltyShootout | null {
  if (!next) return prev ?? null;
  if (!prev) return next;

  const bySlot = new Map<string, PenaltyKick>();
  for (const kick of prev.kicks) {
    bySlot.set(kickSlotKey(kick), kick);
  }
  for (const kick of next.kicks) {
    const key = kickSlotKey(kick);
    const existing = bySlot.get(key);
    bySlot.set(key, existing ? pickBetterKick(existing, kick) : kick);
  }

  const kicks = assignTeamKicks([...bySlot.values()]);
  const tally = tallyFromKicks(kicks);
  const homeScore = next.inProgress
    ? tally.home
    : Math.max(tally.home, next.homeScore, prev?.homeScore ?? 0);
  const awayScore = next.inProgress
    ? tally.away
    : Math.max(tally.away, next.awayScore, prev?.awayScore ?? 0);

  return {
    homeScore,
    awayScore,
    inProgress: next.inProgress,
    kicks,
    aetHome: next.aetHome ?? prev.aetHome,
    aetAway: next.aetAway ?? prev.aetAway,
  };
}

export function penaltyRounds(shootout: PenaltyShootout): PenaltyRound[] {
  const maxRound = Math.max(0, ...shootout.kicks.map((kick) => kick.teamKick));
  if (maxRound === 0) return [];

  return Array.from({ length: maxRound }, (_, index) => {
    const round = index + 1;
    return {
      round,
      home:
        shootout.kicks.find(
          (kick) => kick.side === "home" && kick.teamKick === round,
        ) ?? null,
      away:
        shootout.kicks.find(
          (kick) => kick.side === "away" && kick.teamKick === round,
        ) ?? null,
    };
  });
}

/**
 * Build shootout state from TxLINE score events when status is PEN phase (11–13).
 */
export function extractPenaltyShootout(
  events: TxScoreEvent[],
  homeIsP1: boolean,
  statusId: number,
): PenaltyShootout | null {
  if (
    !isPenaltyShootoutStatusId(statusId) &&
    shootoutStartSeq(events) === Number.POSITIVE_INFINITY
  ) {
    return null;
  }

  const startSeq = shootoutStartSeq(events);
  if (startSeq === Number.POSITIVE_INFINITY) return null;

  const rawKicks = collectShootoutKicks(events, startSeq);
  const statsTally = penShootoutTallyFromStats(events, homeIsP1);
  if (
    rawKicks.length === 0 &&
    !isPenaltyShootoutStatusId(statusId) &&
    !statsTally
  ) {
    return null;
  }

  const kicks = mapRawKicksToPenaltyKicks(rawKicks, homeIsP1);
  const kickTally = tallyFromKicks(kicks);
  const aet = aetScoreFromEvents(events, homeIsP1);
  const useStatsTally =
    statsTally != null &&
    statsTally.home + statsTally.away >= kickTally.home + kickTally.away;

  return {
    homeScore: useStatsTally ? statsTally.home : kickTally.home,
    awayScore: useStatsTally ? statsTally.away : kickTally.away,
    inProgress: statusId === 11 || statusId === 12,
    kicks,
    aetHome: aet.home,
    aetAway: aet.away,
  };
}

export function isPenaltyKickMissed(outcome: PenaltyKickOutcome): boolean {
  return outcome === "missed" || outcome === "saved" || outcome === "unknown";
}

/** Winning side when shootout is complete and not tied. */
export function penaltyShootoutWinner(
  shootout: PenaltyShootout,
): "home" | "away" | null {
  if (shootout.inProgress) return null;
  if (shootout.homeScore > shootout.awayScore) return "home";
  if (shootout.awayScore > shootout.homeScore) return "away";
  return null;
}
