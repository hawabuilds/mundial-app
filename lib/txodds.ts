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

/** Devnet host by default; set TXODDS_API_ORIGIN to the mainnet host in prod. */
const DEFAULT_ORIGIN = "https://txline-dev.txodds.com";

export function getTxoddsOrigin(): string {
  return (process.env.TXODDS_API_ORIGIN?.trim() || DEFAULT_ORIGIN).replace(/\/$/, "");
}

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

async function txFetch(pathname: string): Promise<Response> {
  const apiToken = getTxoddsToken();
  if (!apiToken) throw new Error("TXODDS_API_TOKEN is not configured");
  const jwt = await getGuestJwt();
  return fetch(`${getTxoddsOrigin()}${pathname}`, {
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
  ownGoal: boolean;
};

/** "Surname, First" -> "First Surname"; leaves single-token names as-is. */
function formatPlayerName(preferred: string | null | undefined): string | null {
  if (!preferred) return null;
  const parts = preferred.split(",").map((s) => s.trim());
  if (parts.length >= 2 && parts[1]) return `${parts[1]} ${parts[0]}`.trim();
  return preferred.trim();
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

function playerFromData(
  data: Record<string, unknown> | undefined,
  nameById: Map<number, string>,
): string | null {
  if (!data) return null;
  const inlineName =
    typeof data.PreferredName === "string"
      ? data.PreferredName
      : typeof data.PlayerName === "string"
        ? data.PlayerName
        : null;
  const pid = typeof data.PlayerId === "number" ? data.PlayerId : null;
  return (
    formatPlayerName(inlineName) ??
    (pid != null ? formatPlayerName(nameById.get(pid)) : null)
  );
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
  const goals: TxGoal[] = [];

  for (const e of sorted) {
    const minute = goalMinute(e.Clock?.Seconds);
    for (const base of PERIOD_GOAL_STAT_BASES) {
      for (const participant of [1, 2] as const) {
        const statKey = String(base + participant);
        const v = e.Stats?.[statKey];
        if (v == null) continue;

        const trackKey = `${base}|${participant}`;
        const before = prev.get(trackKey) ?? 0;
        if (v <= before) continue;
        prev.set(trackKey, v);

        for (let i = before; i < v; i += 1) {
          goals.push({ minute, participant, player: null, ownGoal: false });
        }
      }
    }
  }

  return goals;
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
      player: goal.player ?? prev.player,
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

/** Every goal + action_amend row in the snapshot (latest amend wins per clock). */
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
      player: next.player ?? prev.player,
    });
  };

  for (const e of sorted) {
    const participant: 1 | 2 = e.Participant === 2 ? 2 : 1;

    if (e.Action === "goal") {
      const seconds = e.Clock?.Seconds;
      const data = e.Data as Record<string, unknown> | undefined;
      upsert(goalClockKey(participant, seconds), {
        minute: goalMinute(seconds),
        participant,
        player: playerFromData(data, nameById),
        ownGoal: /own/i.test(String(data?.GoalType ?? "")),
      });
      continue;
    }

    if (e.Action !== "action_amend") continue;
    const amend = e.Data as
      | { Action?: string; New?: Record<string, unknown> }
      | undefined;
    if (amend?.Action !== "goal" || !amend.New) continue;

    const seconds =
      (amend.New.Clock as { Seconds?: number } | undefined)?.Seconds ??
      e.Clock?.Seconds;
    upsert(goalClockKey(participant, seconds), {
      minute: goalMinute(seconds),
      participant,
      player: playerFromData(amend.New, nameById),
      ownGoal: /own/i.test(String(amend.New.GoalType ?? "")),
    });
  }

  return [...byClock.values()];
}

/**
 * Extract goals (scorer + minute) from a scores snapshot. Player names come from
 * lineups (normativeId), goal rows, and later action_amend patches. Period stat
 * keys (1000/3000/4000/5000 + participant) rebuild goals when play-by-play rows
 * are trimmed; action rows supply minutes and scorers where present.
 */
export function extractGoals(events: TxScoreEvent[]): TxGoal[] {
  const nameById = lineupNameById(events);
  const fromPeriod = goalsFromPeriodStats(events);
  const fromActions = goalsFromActions(events, nameById);
  const merged = mergeGoalLists(fromPeriod, fromActions);
  merged.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  return merged;
}

export async function fetchScoresSnapshot(fixtureId: number): Promise<TxScoreEvent[]> {
  const res = await txFetch(`/api/scores/snapshot/${fixtureId}`);
  const text = await res.text();
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TxLINE scores snapshot failed: ${res.status} ${text.slice(0, 200)}`);
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Latest state = highest Seq (falls back to array order). */
export function latestScoreEvent(events: TxScoreEvent[]): TxScoreEvent | null {
  if (events.length === 0) return null;
  return events.reduce((best, e) =>
    (e.Seq ?? -1) >= (best.Seq ?? -1) ? e : best,
  );
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
