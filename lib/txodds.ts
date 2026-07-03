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
  Data?: { PlayerId?: number; GoalType?: string };
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

/**
 * Extract goals (scorer + minute) from a scores snapshot. Player names come from
 * the "lineups" event in the same snapshot, keyed by normativeId.
 */
export function extractGoals(events: TxScoreEvent[]): TxGoal[] {
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

  const goals: TxGoal[] = [];
  for (const e of events) {
    if (e.Action !== "goal") continue;
    const seconds = e.Clock?.Seconds;
    const minute =
      typeof seconds === "number" ? Math.max(1, Math.floor(seconds / 60)) : null;
    const participant: 1 | 2 = e.Participant === 2 ? 2 : 1;
    const pid = e.Data?.PlayerId;
    const player = pid != null ? formatPlayerName(nameById.get(pid)) : null;
    const ownGoal = /own/i.test(e.Data?.GoalType ?? "");
    goals.push({ minute, participant, player, ownGoal });
  }

  goals.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
  return goals;
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
// Team-name matching (World Cup / friendlies country names)
// ---------------------------------------------------------------------------

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string[]> = {
  usa: ["united states", "u s a", "us"],
  "bosnia herzegovina": ["bosnia", "bih", "bosnia & herzegovina"],
  "cape verde": ["cabo verde", "cape verde islands"],
  "fyr macedonia": ["north macedonia", "macedonia", "mk"],
  curacao: ["curaçao", "curacao"],
  "south korea": ["korea republic", "republic of korea"],
  "ivory coast": ["cote d ivoire", "cote divoire"],
  turkiye: ["turkey"],
  "congo dr": ["dr congo", "democratic republic of congo", "congo democratic republic"],
  "czech republic": ["czechia"],
  iran: ["ir iran", "team melli"],
  "south africa": ["rsa", "bafana bafana"],
  "republic of ireland": ["rep of ireland", "ireland"],
};

export function teamNamesMatch(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;

  for (const [key, values] of Object.entries(TEAM_ALIASES)) {
    const names = [key, ...values];
    const xHit = names.some((n) => x.includes(n) || n.includes(x));
    const yHit = names.some((n) => y.includes(n) || n.includes(y));
    if (xHit && yHit) return true;
  }
  return false;
}

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
    const p1Home = teamNamesMatch(fx.Participant1, home);
    const p2Away = teamNamesMatch(fx.Participant2, away);
    const p1Away = teamNamesMatch(fx.Participant1, away);
    const p2Home = teamNamesMatch(fx.Participant2, home);
    const teamsMatch = (p1Home && p2Away) || (p1Away && p2Home);
    if (!teamsMatch) continue;

    const delta = Math.abs((fx.StartTime ?? 0) - kickoffMs);
    if (delta > RESOLVE_MAX_DELTA_MS) continue;
    if (delta < bestDelta) {
      best = fx;
      bestDelta = delta;
    }
  }

  return best;
}
