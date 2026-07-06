// TxLINE (TxODDS) transport client.
//
// Replaces the old api-football.com data source. TxLINE serves scout-verified
// World Cup + International Friendlies data on-chain-validated via Solana.
//
// Auth model (see https://txline.txodds.com/documentation/worldcup):
//   1. POST /auth/guest/start                 -> short-lived guest JWT
//   2. every request carries both:
//        Authorization: Bearer <guest jwt>
//        X-Api-Token:   <activated api token>   (from token/activate)
//
// The api token is obtained once via txodds/get-txodds-key.mjs and provided at
// runtime through TXODDS_API_TOKEN (Vercel/.env.local). For local dev we fall
// back to reading txodds/api-token.txt.

import fs from "node:fs";
import path from "node:path";
import {
  binaryFieldToBase64,
  isBinaryField,
  normalizeBinaryField,
} from "./txBinaryProof";
import {
  REGULATION_GOAL_STAT_KEYS,
  TOTAL_GOAL_STAT_KEYS,
} from "./txScoreProofSemantics";
import { resolveProofEventSeq } from "./txScoreEventSeq";
import { getTxoddsOrigin } from "./txoddsOrigin";
import type { TxScoreStat } from "./txScoreStat";
import {
  formatPlayerFullName,
  formatPlayerShortName,
} from "./playerDisplayName";

export { getTxoddsOrigin };
export type { TxScoreStat } from "./txScoreStat";
export { resolveProofEventSeq, gameFinalisedEventSeq } from "./txScoreEventSeq";
export type { ProofSeqSource } from "./txScoreEventSeq";

let cachedFileToken: string | null | undefined;

/** Local-dev fallback: read the token written by get-txodds-key.mjs. */
function readTokenFile(): string | null {
  if (cachedFileToken !== undefined) return cachedFileToken;
  try {
    const p = path.join(process.cwd(), "txodds", "api-token.txt");
    const raw = fs.readFileSync(p, "utf8").trim();
    cachedFileToken = raw || null;
  } catch {
    cachedFileToken = null;
  }
  return cachedFileToken;
}

export function getTxoddsToken(): string | null {
  return process.env.TXODDS_API_TOKEN?.trim() || readTokenFile();
}

export function isTxoddsConfigured(): boolean {
  return Boolean(getTxoddsToken());
}

// ---------------------------------------------------------------------------
// Guest JWT (cached, auto-refreshed just before expiry)
// ---------------------------------------------------------------------------

let guestJwt: { token: string; expiresAtMs: number } | null = null;

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getGuestJwt(): Promise<string> {
  const now = Date.now();
  if (guestJwt && guestJwt.expiresAtMs - 60_000 > now) return guestJwt.token;

  const res = await fetch(`${getTxoddsOrigin()}/auth/guest/start`, { method: "POST" });
  const text = await res.text();
  if (!res.ok) throw new Error(`TxLINE guest auth failed: ${res.status} ${text.slice(0, 200)}`);

  let token = text.trim().replace(/^"|"$/g, "");
  try {
    const j = JSON.parse(text);
    token = j.token || j.jwt || j.accessToken || token;
  } catch {
    // plain-text token
  }

  const exp = jwtExpiryMs(token);
  guestJwt = { token, expiresAtMs: exp || now + 30 * 60_000 };
  return token;
}

async function txFetch(
  pathname: string,
  query?: Record<string, string | number | undefined>,
): Promise<Response> {
  const apiToken = getTxoddsToken();
  if (!apiToken) throw new Error("TXODDS_API_TOKEN is not configured");
  const jwt = await getGuestJwt();
  const url = new URL(`${getTxoddsOrigin()}${pathname}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
    cache: "no-store",
  });
}

// ---------------------------------------------------------------------------
// Fixtures snapshot
// ---------------------------------------------------------------------------

export type TxFixture = {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
  GameState?: number;
};

const FIXTURES_TTL_MS = 60_000;
let fixturesCache: { at: number; data: TxFixture[] } | null = null;

export async function fetchFixturesSnapshot(
  options?: { fresh?: boolean },
): Promise<TxFixture[]> {
  const now = Date.now();
  if (!options?.fresh && fixturesCache && now - fixturesCache.at < FIXTURES_TTL_MS) {
    return fixturesCache.data;
  }
  const res = await txFetch("/api/fixtures/snapshot");
  const text = await res.text();
  if (!res.ok) throw new Error(`TxLINE fixtures snapshot failed: ${res.status} ${text.slice(0, 200)}`);
  let data: TxFixture[] = [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) data = parsed;
  } catch {
    data = [];
  }
  fixturesCache = { at: now, data };
  return data;
}

// ---------------------------------------------------------------------------
// Odds snapshot (1X2 StablePrice — used for upset bonus at kickoff lock)
// ---------------------------------------------------------------------------

export type TxOddsRow = {
  FixtureId: number;
  Ts?: number;
  SuperOddsType?: string;
  MarketPeriod?: string | null;
  PriceNames?: string[];
  Pct?: string[];
};

export type Match1x2Odds = {
  homePct: number;
  drawPct: number;
  awayPct: number;
};

export async function fetchOddsSnapshot(fixtureId: number): Promise<TxOddsRow[]> {
  const res = await txFetch(`/api/odds/snapshot/${fixtureId}`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TxLINE odds snapshot failed: ${res.status} ${text.slice(0, 200)}`);
  }
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Full-time 1X2 implied percentages (part1 / draw / part2). */
export function parse1x2FullTime(rows: TxOddsRow[]): Match1x2Odds | null {
  const isFullTime = (period: string | null | undefined) =>
    !period || period === "null" || period === "FT" || period === "FullTime";

  const candidates = rows.filter(
    (row) =>
      (row.SuperOddsType === "1X2_PARTICIPANT_RESULT" ||
        row.SuperOddsType?.includes("1X2")) &&
      isFullTime(row.MarketPeriod),
  );
  if (candidates.length === 0) return null;

  const latest = candidates.reduce((best, row) =>
    (row.Ts ?? 0) >= (best.Ts ?? 0) ? row : best,
  );
  const names = latest.PriceNames ?? [];
  const pcts = latest.Pct ?? [];
  const idx = (key: string) => names.indexOf(key);
  const read = (key: string) => {
    const i = idx(key);
    if (i < 0 || !pcts[i] || pcts[i] === "NA") return null;
    const n = Number.parseFloat(pcts[i]!);
    return Number.isFinite(n) ? n : null;
  };

  const homePct = read("part1");
  const drawPct = read("draw");
  const awayPct = read("part2");
  if (homePct == null || drawPct == null || awayPct == null) return null;

  return { homePct, drawPct, awayPct };
}

// ---------------------------------------------------------------------------
// Scores snapshot (full event sequence for a fixture)
// ---------------------------------------------------------------------------

/** Cumulative per-period soccer stats. Keys follow (period*1000)+base. */
export type TxScoreEvent = {
  FixtureId: number;
  StatusId?: number;
  Seq?: number;
  Ts?: number;
  Participant1IsHome?: boolean;
  /** Play-by-play action type, e.g. "goal", "yellow_card", "lineups". */
  Action?: string;
  /** Team the event is credited to (1 or 2). */
  Participant?: number;
  Clock?: { Running?: boolean; Seconds?: number };
  Data?: {
    PlayerId?: number;
    GoalType?: string;
    PreferredName?: string;
    PlayerName?: string;
    [key: string]: unknown;
  };
  /** Present on the "lineups" event: per-team squad with player names. */
  Lineups?: TxLineupTeam[];
  /** (period*1000)+base_key -> value. Base 1/2 = P1/P2 total goals. */
  Stats?: Record<string, number>;
  Score?: {
    Participant1?: TxPeriodScores;
    Participant2?: TxPeriodScores;
  };
};

type TxPeriodScores = {
  H1?: { Goals?: number };
  H2?: { Goals?: number };
  Total?: { Goals?: number };
};

type TxLineupTeam = {
  preferredName?: string;
  lineups?: {
    player?: { normativeId?: number; preferredName?: string };
  }[];
};

/** A scored goal, credited to a participant, with scorer + minute. */
export type TxGoal = {
  minute: number | null;
  participant: 1 | 2;
  player: string | null;
  playerShort: string | null;
  ownGoal: boolean;
  penalty: boolean;
};

function isOwnGoalType(goalType: unknown): boolean {
  return /own/i.test(String(goalType ?? ""));
}

function isPenaltyGoalType(goalType: unknown): boolean {
  return /pen/i.test(String(goalType ?? ""));
}

function scorerFromData(
  data: Record<string, unknown> | undefined,
  nameById: Map<number, string>,
): { player: string | null; playerShort: string | null } {
  if (!data) return { player: null, playerShort: null };
  const inlineName =
    typeof data.PreferredName === "string"
      ? data.PreferredName
      : typeof data.PlayerName === "string"
        ? data.PlayerName
        : null;
  const pid = typeof data.PlayerId === "number" ? data.PlayerId : null;
  const preferred = inlineName ?? (pid != null ? nameById.get(pid) : undefined);
  if (!preferred) return { player: null, playerShort: null };
  return {
    player: formatPlayerFullName(preferred),
    playerShort: formatPlayerShortName(preferred),
  };
}

function lineupNameById(events: TxScoreEvent[]): Map<number, string> {
  const nameById = new Map<number, string>();
  for (const e of events) {
    for (const team of e.Lineups ?? []) {
      for (const entry of team.lineups ?? []) {
        const id = entry.player?.normativeId;
        const name = entry.player?.preferredName;
        if (id != null && name) nameById.set(id, name);
      }
    }
  }
  return nameById;
}

function goalMinute(seconds: number | undefined): number | null {
  return typeof seconds === "number" ? Math.max(1, Math.floor(seconds / 60)) : null;
}

function goalKeyByMinute(goal: TxGoal): string {
  return `${goal.participant}|${goal.minute ?? "?"}`;
}

/**
 * Period stat keys: 1000+P = H1, 3000+P = H2, 4000+P = ET1, 5000+P = ET2.
 * (7000+P is a running ET total — skip to avoid double-counting.)
 */
const PERIOD_GOAL_STAT_BASES = [1000, 3000, 4000, 5000];

function goalsFromPeriodStats(events: TxScoreEvent[]): TxGoal[] {
  const sorted = [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
  const prev = new Map<string, number>();
  const goalsByTrack = new Map<string, TxGoal[]>();

  for (const e of sorted) {
    const minute = goalMinute(e.Clock?.Seconds);
    for (const base of PERIOD_GOAL_STAT_BASES) {
      for (const participant of [1, 2] as const) {
        const statKey = String(base + participant);
        const v = e.Stats?.[statKey];
        if (v == null) continue;

        const trackKey = `${base}|${participant}`;
        const before = prev.get(trackKey) ?? 0;

        if (v < before) {
          prev.set(trackKey, v);
          const existing = goalsByTrack.get(trackKey) ?? [];
          goalsByTrack.set(trackKey, existing.slice(0, v));
          continue;
        }
        if (v <= before) continue;

        prev.set(trackKey, v);
        const list = goalsByTrack.get(trackKey) ?? [];
        for (let i = before; i < v; i += 1) {
          list.push({
            minute,
            participant,
            player: null,
            playerShort: null,
            ownGoal: false,
            penalty: false,
          });
        }
        goalsByTrack.set(trackKey, list);
      }
    }
  }

  return [...goalsByTrack.values()].flat();
}

function mergeGoalLists(periodGoals: TxGoal[], actionGoals: TxGoal[]): TxGoal[] {
  const byKey = new Map<string, TxGoal>();
  for (const goal of [...periodGoals, ...actionGoals]) {
    const key = goalKeyByMinute(goal);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, goal);
      continue;
    }
    byKey.set(key, {
      minute: goal.minute ?? prev.minute,
      participant: goal.participant,
      ownGoal: goal.ownGoal || prev.ownGoal,
      penalty: goal.penalty || prev.penalty,
      player: goal.player ?? prev.player,
      playerShort: goal.playerShort ?? prev.playerShort,
    });
  }
  return [...byKey.values()];
}

function goalClockKey(participant: 1 | 2, seconds: number | undefined): string {
  return `${participant}|${seconds ?? "?"}`;
}

/**
 * Play-by-play goals only (goal + action_amend rows). Prefer this for persistence —
 * period stat rows lack scorers and often attach the wrong clock after FT.
 */
export function extractActionGoals(events: TxScoreEvent[]): TxGoal[] {
  const nameById = lineupNameById(events);
  return goalsFromActions(events, nameById);
}

/** Every goal, penalty_outcome (scored), and action_amend row (latest amend wins per clock). */
function goalsFromActions(
  events: TxScoreEvent[],
  nameById: Map<number, string>,
): TxGoal[] {
  const sorted = [...events].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
  const byClock = new Map<string, TxGoal>();

  const upsert = (key: string, next: TxGoal) => {
    const prev = byClock.get(key);
    if (!prev) {
      byClock.set(key, next);
      return;
    }
    byClock.set(key, {
      minute: next.minute ?? prev.minute,
      participant: next.participant,
      ownGoal: next.ownGoal || prev.ownGoal,
      penalty: next.penalty || prev.penalty,
      player: next.player ?? prev.player,
      playerShort: next.playerShort ?? prev.playerShort,
    });
  };

  for (const e of sorted) {
    const participant: 1 | 2 = e.Participant === 2 ? 2 : 1;

    if (e.Action === "goal") {
      const seconds = e.Clock?.Seconds;
      const data = e.Data as Record<string, unknown> | undefined;
      const scorer = scorerFromData(data, nameById);
      upsert(goalClockKey(participant, seconds), {
        minute: goalMinute(seconds),
        participant,
        ...scorer,
        ownGoal: isOwnGoalType(data?.GoalType),
        penalty: isPenaltyGoalType(data?.GoalType),
      });
      continue;
    }

    if (e.Action === "penalty_outcome") {
      const data = e.Data as Record<string, unknown> | undefined;
      const outcome = String(data?.Outcome ?? "").toLowerCase();
      if (outcome !== "scored") continue;
      const seconds = e.Clock?.Seconds;
      const scorer = scorerFromData(data, nameById);
      upsert(goalClockKey(participant, seconds), {
        minute: goalMinute(seconds),
        participant,
        ...scorer,
        ownGoal: false,
        penalty: true,
      });
      continue;
    }

    if (e.Action !== "action_amend") continue;
    const amend = e.Data as
      | { Action?: string; New?: Record<string, unknown> }
      | undefined;
    if (!amend?.New) continue;

    if (amend.Action === "penalty_outcome") {
      const outcome = String(amend.New.Outcome ?? "").toLowerCase();
      if (outcome !== "scored") continue;
      const seconds =
        (amend.New.Clock as { Seconds?: number } | undefined)?.Seconds ??
        e.Clock?.Seconds;
      const scorer = scorerFromData(amend.New, nameById);
      upsert(goalClockKey(participant, seconds), {
        minute: goalMinute(seconds),
        participant,
        ...scorer,
        ownGoal: false,
        penalty: true,
      });
      continue;
    }

    if (amend.Action !== "goal") continue;

    const seconds =
      (amend.New.Clock as { Seconds?: number } | undefined)?.Seconds ??
      e.Clock?.Seconds;
    const scorer = scorerFromData(amend.New, nameById);
    upsert(goalClockKey(participant, seconds), {
      minute: goalMinute(seconds),
      participant,
      ...scorer,
      ownGoal: isOwnGoalType(amend.New.GoalType),
      penalty: isPenaltyGoalType(amend.New.GoalType),
    });
  }

  return [...byClock.values()];
}

/**
 * Extract goals for display. Play-by-play rows are authoritative; period-stat
 * placeholders only fill gaps when actions lack a scorer/minute.
 */
export function extractGoals(events: TxScoreEvent[]): TxGoal[] {
  const nameById = lineupNameById(events);
  const fromActions = goalsFromActions(events, nameById);
  const fromPeriod = goalsFromPeriodStats(events);
  const merged = mergeGoalLists(fromPeriod, fromActions);
  merged.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  return merged;
}

export async function fetchScoresSnapshot(fixtureId: number): Promise<TxScoreEvent[]> {
  const res = await txFetch(`/api/scores/snapshot/${fixtureId}`);
  const text = await res.text();
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TxLINE scores snapshot failed: ${res.status} ${text.slice(0, 200)}`);
  return parseScoreSequenceBody(text);
}

/**
 * Parse GET /api/scores/historical/{fixtureId} — JSON array or SSE (`data: {...}` lines).
 */
export function parseScoreSequenceBody(text: string): TxScoreEvent[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed as TxScoreEvent[];
      if (parsed && typeof parsed === "object") return [parsed as TxScoreEvent];
    } catch {
      return [];
    }
  }

  const events: TxScoreEvent[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const prefix = "data:";
    if (!line.startsWith(prefix)) continue;
    const payload = line.slice(prefix.length).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      events.push(JSON.parse(payload) as TxScoreEvent);
    } catch {
      // skip malformed SSE rows
    }
  }
  return events;
}

/**
 * Full ordered score-update sequence for one fixture (play-by-play + period stats).
 * GET /api/scores/historical/{fixtureId} — retained ~2 weeks after kickoff.
 */
export async function fetchScoreSequence(fixtureId: number): Promise<TxScoreEvent[]> {
  const res = await txFetch(`/api/scores/historical/${fixtureId}`);
  const text = await res.text();
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(
      `TxLINE scores historical failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
  return parseScoreSequenceBody(text);
}

/** Latest state = highest Seq (falls back to array order). */
export function latestScoreEvent(events: TxScoreEvent[]): TxScoreEvent | null {
  if (events.length === 0) return null;
  return events.reduce((best, e) =>
    (e.Seq ?? -1) >= (best.Seq ?? -1) ? e : best,
  );
}

const TERMINAL_SCORE_STATUS_IDS = new Set([5, 10, 13, 100]);

/** Feed noise that must not drive the live board (hydration-break reconnects, etc.). */
const LIVE_DISPLAY_IGNORE_ACTIONS = new Set([
  "disconnected",
  "game_finalised",
  "venue",
  "weather",
]);

/**
 * Latest score-bearing event for live UI — ignores terminal rows and reconnect
 * noise that can arrive with inflated Seq during in-play hydration breaks.
 */
export function latestLiveScoreEvent(events: TxScoreEvent[]): TxScoreEvent | null {
  if (events.length === 0) return null;
  const candidates = events.filter(
    (event) =>
      event.StatusId != null &&
      !TERMINAL_SCORE_STATUS_IDS.has(event.StatusId) &&
      (!event.Action || !LIVE_DISPLAY_IGNORE_ACTIONS.has(event.Action)),
  );
  if (candidates.length === 0) return latestScoreEvent(events);
  return candidates.reduce((best, event) =>
    (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
  );
}

/** Last running clock for the live pill — at HT freeze on the last 1H clock. */
export function lastLiveClockSeconds(
  events: TxScoreEvent[],
  gameState?: number,
): number | null {
  const withClock = (statusIds: number[]) =>
    events
      .filter(
        (event) =>
          event.StatusId != null &&
          statusIds.includes(event.StatusId) &&
          typeof event.Clock?.Seconds === "number" &&
          (!event.Action || !LIVE_DISPLAY_IGNORE_ACTIONS.has(event.Action)),
      )
      .map((event) => event.Clock!.Seconds!);

  if (gameState === 3 || gameState === 8) {
    const h1 = withClock([2]);
    if (h1.length > 0) return Math.max(...h1);
  }

  const any = withClock([2, 3, 4, 7, 9, 14]);
  return any.length > 0 ? Math.max(...any) : null;
}

/** True once the feed has a 2H row after halftime (snapshot can lag on HT). */
export function secondHalfHasStarted(events: TxScoreEvent[]): boolean {
  const htSeq = events.reduce((max, event) => {
    if (event.StatusId === 3 || event.Action === "halftime_finalised") {
      return Math.max(max, event.Seq ?? -1);
    }
    return max;
  }, -1);
  if (htSeq < 0) return false;
  return events.some(
    (event) =>
      event.StatusId === 4 &&
      (event.Seq ?? -1) > htSeq &&
      (!event.Action || !LIVE_DISPLAY_IGNORE_ACTIONS.has(event.Action)),
  );
}

/** Match is over on the scores feed (terminal StatusId or game_finalised). */
export function scoresFeedShowsTerminalFinish(events: TxScoreEvent[]): boolean {
  return (
    events.some((event) => event.Action === "game_finalised") ||
    terminalScoreEventSeq(events) != null
  );
}

/** Latest terminal StatusId from the scores feed (FT / AET / PEN / game_finalised). */
export function latestTerminalStatusId(events: TxScoreEvent[]): number | null {
  const terminal = events.filter(
    (event) =>
      event.Action === "game_finalised" ||
      (event.StatusId != null && TERMINAL_SCORE_STATUS_IDS.has(event.StatusId)),
  );
  if (terminal.length === 0) return null;
  const latest = terminal.reduce((best, event) =>
    (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
  );
  return latest.StatusId ?? 5;
}

/** Seq of the latest terminal scores event (FT / AET / PEN) for stat-validation. */
export function terminalScoreEventSeq(events: TxScoreEvent[]): number | null {
  const terminal = events.filter(
    (event) =>
      event.StatusId != null && TERMINAL_SCORE_STATUS_IDS.has(event.StatusId),
  );
  if (terminal.length === 0) return null;
  const latest = terminal.reduce((best, event) =>
    (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
  );
  return latest.Seq ?? null;
}

// ---------------------------------------------------------------------------
// Scores stat-validation proofs (GET /api/scores/stat-validation)
// ---------------------------------------------------------------------------


/** Normalised proof node — hash stored as base64 (32 bytes). */
export type TxProofNode = {
  hash: string;
  isRightSibling: boolean;
};

/** OpenAPI: ScoresUpdateStats */
export type TxScoresUpdateStats = {
  updateCount: number;
  minTimestamp: number;
  maxTimestamp: number;
};

/** Normalised batch summary — binary roots as base64. */
export type TxScoresBatchSummary = {
  fixtureId: number;
  updateStats: TxScoresUpdateStats;
  eventStatsSubTreeRoot: string;
};

/** OpenAPI: ScoresStatValidation (legacy mode). */
export type TxScoresStatValidation = {
  ts: number;
  statToProve: TxScoreStat;
  eventStatRoot: string;
  summary: TxScoresBatchSummary;
  statProof: TxProofNode[];
  subTreeProof: TxProofNode[];
  mainTreeProof: TxProofNode[];
  statToProve2?: TxScoreStat;
  statProof2?: TxProofNode[];
};

/** OpenAPI: ScoresStatValidationV2 (statKeys mode). */
export type TxScoresStatValidationV2 = {
  ts: number;
  statsToProve?: TxScoreStat[];
  eventStatRoot: string;
  summary: TxScoresBatchSummary;
  statProofs?: TxProofNode[][];
  subTreeProof: TxProofNode[];
  mainTreeProof: TxProofNode[];
};

export type TxScoreProofPayload = TxScoresStatValidation | TxScoresStatValidationV2;

export type FetchScoreProofResult =
  | {
      status: "ok";
      proof: TxScoreProofPayload;
      seq: number;
      statKeys: number[];
      proofMode: "regulation" | "total";
    }
  | { status: "not_yet_available"; reason: string }
  | { status: "error"; message: string };

export type FetchScoreProofOptions = {
  /** Required unless resolved from the scores snapshot by the caller. */
  seq?: number;
  /** Explicit stat keys; default tries regulation (1001/1002/3001/3002) then total (1/2). */
  statKeys?: number[];
};

function normalizeProofNode(value: unknown): TxProofNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const bytes = normalizeBinaryField(record.hash);
  if (!bytes) return null;
  return {
    hash: binaryFieldToBase64(bytes),
    isRightSibling: Boolean(record.isRightSibling),
  };
}

function normalizeProofNodeList(value: unknown): TxProofNode[] | null {
  if (!Array.isArray(value)) return null;
  const nodes = value.map(normalizeProofNode);
  if (nodes.some((node) => node == null)) return null;
  return nodes as TxProofNode[];
}

function normalizeSummary(value: unknown): TxScoresBatchSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const updateStats = record.updateStats;
  if (!updateStats || typeof updateStats !== "object") return null;
  const stats = updateStats as Record<string, unknown>;
  const rootBytes = normalizeBinaryField(record.eventStatsSubTreeRoot);
  if (!rootBytes) return null;
  if (typeof record.fixtureId !== "number") return null;
  if (typeof stats.updateCount !== "number") return null;
  if (typeof stats.minTimestamp !== "number") return null;
  if (typeof stats.maxTimestamp !== "number") return null;
  return {
    fixtureId: record.fixtureId,
    updateStats: {
      updateCount: stats.updateCount,
      minTimestamp: stats.minTimestamp,
      maxTimestamp: stats.maxTimestamp,
    },
    eventStatsSubTreeRoot: binaryFieldToBase64(rootBytes),
  };
}

/** Accept devnet byte arrays or base64 strings; emit normalised payload. */
export function normalizeScoreProofPayload(value: unknown): TxScoreProofPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.ts !== "number") return null;

  const eventRootBytes = normalizeBinaryField(record.eventStatRoot);
  if (!eventRootBytes) return null;

  const summary = normalizeSummary(record.summary);
  const subTreeProof = normalizeProofNodeList(record.subTreeProof);
  const mainTreeProof = normalizeProofNodeList(record.mainTreeProof);
  if (!summary || !subTreeProof || !mainTreeProof) return null;

  const eventStatRoot = binaryFieldToBase64(eventRootBytes);

  if (Array.isArray(record.statsToProve)) {
    const statProofs = record.statProofs;
    if (!Array.isArray(statProofs)) return null;
    const normalizedProofs: TxProofNode[][] = [];
    for (const group of statProofs) {
      const nodes = normalizeProofNodeList(group);
      if (!nodes) return null;
      normalizedProofs.push(nodes);
    }
    return {
      ts: record.ts,
      statsToProve: record.statsToProve as TxScoreStat[],
      eventStatRoot,
      summary,
      statProofs: normalizedProofs,
      subTreeProof,
      mainTreeProof,
    };
  }

  if (!record.statToProve || typeof record.statToProve !== "object") return null;
  const statProof = normalizeProofNodeList(record.statProof);
  if (!statProof) return null;

  const legacy: TxScoresStatValidation = {
    ts: record.ts,
    statToProve: record.statToProve as TxScoreStat,
    eventStatRoot,
    summary,
    statProof,
    subTreeProof,
    mainTreeProof,
  };

  if (record.statToProve2 && typeof record.statToProve2 === "object") {
    const statProof2 = normalizeProofNodeList(record.statProof2);
    if (!statProof2) return null;
    legacy.statToProve2 = record.statToProve2 as TxScoreStat;
    legacy.statProof2 = statProof2;
  }

  return legacy;
}

function isIncompleteProofPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const record = value as Record<string, unknown>;
  if (typeof record.ts !== "number") return true;
  if (!isBinaryField(record.eventStatRoot)) return true;
  if (!record.summary || typeof record.summary !== "object") return true;
  const summary = record.summary as Record<string, unknown>;
  if (!isBinaryField(summary.eventStatsSubTreeRoot)) return true;
  if (!Array.isArray(record.subTreeProof) || !Array.isArray(record.mainTreeProof)) {
    return true;
  }
  const hasLegacy = record.statToProve != null && Array.isArray(record.statProof);
  const hasV2 = Array.isArray(record.statsToProve) && Array.isArray(record.statProofs);
  return !hasLegacy && !hasV2;
}

/** Classify HTTP failures for stat-validation (OpenAPI lists 400/401/403/500). */
export function classifyScoreProofHttpFailure(
  status: number,
  body: string,
): "not_yet_available" | "error" {
  const lower = body.toLowerCase();
  if (status === 404) return "not_yet_available";
  if (
    status === 400 &&
    /not found|not available|not ready|no proof|missing|unknown seq|invalid seq/i.test(
      lower,
    )
  ) {
    return "not_yet_available";
  }
  if (
    status === 500 &&
    /not found|not available|not ready|merkle|proof/i.test(lower)
  ) {
    return "not_yet_available";
  }
  return "error";
}

/** Parse a 200 JSON body from GET /api/scores/stat-validation. */
export function parseScoreProofResponse(
  status: number,
  body: string,
  context: { seq: number; statKeys: number[] },
): FetchScoreProofResult {
  if (status !== 200) {
    const kind = classifyScoreProofHttpFailure(status, body);
    if (kind === "not_yet_available") {
      return {
        status: "not_yet_available",
        reason: body.trim().slice(0, 240) || `HTTP ${status}`,
      };
    }
    return {
      status: "error",
      message: `TxLINE stat-validation failed: ${status} ${body.slice(0, 200)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: "error", message: "TxLINE stat-validation returned invalid JSON" };
  }

  if (isIncompleteProofPayload(parsed)) {
    return {
      status: "not_yet_available",
      reason: "Response missing required proof fields",
    };
  }

  const normalized = normalizeScoreProofPayload(parsed);
  if (!normalized) {
    return {
      status: "error",
      message: "TxLINE stat-validation returned unparseable binary proof fields",
    };
  }

  const proofMode = context.statKeys.every((key) =>
    (REGULATION_GOAL_STAT_KEYS as readonly number[]).includes(key),
  )
    ? "regulation"
    : "total";

  return {
    status: "ok",
    proof: normalized,
    seq: context.seq,
    statKeys: context.statKeys,
    proofMode,
  };
}

async function requestScoreProof(
  txFixtureId: number,
  seq: number,
  statKeys: number[],
): Promise<FetchScoreProofResult> {
  const res = await txFetch("/api/scores/stat-validation", {
    fixtureId: txFixtureId,
    seq,
    statKeys: statKeys.join(","),
  });
  const text = await res.text();
  return parseScoreProofResponse(res.status, text, { seq, statKeys });
}

/**
 * Fetch Merkle proofs for fixture score stats via GET /api/scores/stat-validation.
 * Auth: guest JWT + X-Api-Token (Quickstart / On-Chain Validation docs).
 *
 * Default: request regulation keys (H1+H2 per soccer feed encoding), fall back to totals.
 */
export async function fetchScoreProof(
  txFixtureId: number,
  options?: FetchScoreProofOptions,
): Promise<FetchScoreProofResult> {
  let seq = options?.seq;

  if (seq == null) {
    const events = await fetchScoresSnapshot(txFixtureId);
    const resolved = resolveProofEventSeq(events);
    seq = resolved.seq ?? undefined;
    if (seq == null) {
      return {
        status: "not_yet_available",
        reason: "No game_finalised or terminal scores event in snapshot yet",
      };
    }
  }

  if (options?.statKeys) {
    return requestScoreProof(txFixtureId, seq, options.statKeys);
  }

  const regulation = await requestScoreProof(
    txFixtureId,
    seq,
    [...REGULATION_GOAL_STAT_KEYS],
  );
  if (regulation.status === "ok") return regulation;
  if (regulation.status === "error") return regulation;

  return requestScoreProof(txFixtureId, seq, [...TOTAL_GOAL_STAT_KEYS]);
}

// ---------------------------------------------------------------------------
// Team-name matching — see lib/teamNames.ts (client-safe)
// ---------------------------------------------------------------------------

export { teamNamesMatch } from "./teamNames";
import { teamNamesMatch } from "./teamNames";
import { normalizeStartTimeMs } from "./formatKickoff";
import { isFriendlyCompetition } from "./matchStage";

const RESOLVE_MAX_DELTA_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Find the TxLINE fixture for a Mundial fixture by team names, picking the one
 * whose kickoff is closest to `kickoffMs` (disambiguates repeat meetings).
 */
export async function resolveTxFixture(
  home: string,
  away: string,
  kickoffMs: number,
): Promise<TxFixture | null> {
  const fixtures = await fetchFixturesSnapshot();

  let best: TxFixture | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const fx of fixtures) {
    if (isFriendlyCompetition(fx.Competition ?? "")) continue;

    const p1Home = teamNamesMatch(fx.Participant1, home);
    const p2Away = teamNamesMatch(fx.Participant2, away);
    const p1Away = teamNamesMatch(fx.Participant1, away);
    const p2Home = teamNamesMatch(fx.Participant2, home);
    const teamsMatch = (p1Home && p2Away) || (p1Away && p2Home);
    if (!teamsMatch) continue;

    const delta = Math.abs(normalizeStartTimeMs(fx.StartTime ?? 0) - kickoffMs);
    if (delta > RESOLVE_MAX_DELTA_MS) continue;
    if (delta < bestDelta) {
      best = fx;
      bestDelta = delta;
    }
  }

  return best;
}
