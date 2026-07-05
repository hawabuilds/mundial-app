import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getFixtureById, type Fixture } from "@/app/data/fixtures";
import {
  scorePrediction,
  scorePredictionDetailed,
  tierToBreakdownBucket,
  type MatchScore,
} from "@/lib/scoring";
import {
  isReplyBeforeKickoff,
  loadEligiblePreKickoffPredictions,
} from "@/lib/predictionEligibility";
import type { Match1x2Odds } from "@/lib/scoring";
import {
  dailyScoresMerkleRootsPda,
  solanaExplorerAddressUrl,
} from "@/lib/txlineProofDisplay";
import {
  dualProofPopoverIntro,
  statsFromProofPayload,
  type ProofScoreMode,
} from "@/lib/txScoreProofSemantics";
import type { ProofSeqSource } from "@/lib/txScoreEventSeq";

let client: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

/** Supabase client expects the project URL only — not `/rest/v1/`. */
export function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

/** Anon Supabase client — Storage uploads only (bounty buckets). Do not use for DB table access. */
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!client) {
    client = createClient(normalizeSupabaseUrl(url), anonKey);
  }

  return client;
}

/** Service role bypasses RLS — set SUPABASE_SERVICE_ROLE_KEY for admin scripts. */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (Supabase Dashboard → Settings → API → service_role)",
    );
  }

  if (!adminClient) {
    adminClient = createClient(normalizeSupabaseUrl(url), serviceKey);
  }

  return adminClient;
}

export type PredictionRow = {
  user_id: string;
  user_handle: string;
  match_id: number;
  home_score: number;
  away_score: number;
  points?: number | null;
  replied_at?: string | null;
};

export type MatchStateRow = {
  match_id: number;
  predictions_collected_at: string | null;
  scored_at: string | null;
  final_home_score: number | null;
  final_away_score: number | null;
  match_tweet_id: string | null;
  match_fixture_key: string | null;
  home_team: string | null;
  away_team: string | null;
  kickoff_at: string | null;
};

export async function savePrediction(row: PredictionRow): Promise<void> {
  if (!/^\d{1,20}$/.test(row.user_id.trim())) {
    throw new Error(
      `predictions.user_id must be X numeric author_id, got: ${row.user_id}`,
    );
  }

  const supabase = getSupabaseAdminClient();

  const base = {
    user_id: row.user_id,
    user_handle: row.user_handle,
    match_id: row.match_id,
    home_score: row.home_score,
    away_score: row.away_score,
  };

  const withRepliedAt =
    row.replied_at != null ? { ...base, replied_at: row.replied_at } : base;

  let { error } = await supabase.from("predictions").upsert(withRepliedAt, {
    onConflict: "user_id,match_id",
  });

  if (
    error &&
    row.replied_at &&
    error.message.includes("replied_at")
  ) {
    ({ error } = await supabase.from("predictions").upsert(base, {
      onConflict: "user_id,match_id",
    }));
  }

  if (
    error &&
    (error.message.includes("ON CONFLICT") ||
      error.message.includes("unique or exclusion constraint") ||
      error.message.includes("predictions_pkey"))
  ) {
    throw new Error(
      "predictions must allow one row per user per match (primary key on user_id + match_id). " +
        "Run supabase/schema.sql in the Supabase SQL editor, then backfill earlier matches.",
    );
  }

  if (error) {
    throw new Error(error.message);
  }
}

export async function deletePredictionsForMatch(matchId: number): Promise<number> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("predictions")
    .delete()
    .eq("match_id", matchId)
    .select("user_id");

  if (error) {
    throw new Error(error.message);
  }

  return data?.length ?? 0;
}

/** Clears collection/scoring flags so crons do not treat a voided match as done. */
export async function resetMatchCollection(matchId: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("match_state")
    .update({ predictions_collected_at: null })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
}

export async function resetMatchScoring(matchId: number): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error: pointsError } = await supabase
    .from("predictions")
    .update({ points: null })
    .eq("match_id", matchId);

  if (pointsError) {
    throw new Error(pointsError.message);
  }

  const { error: stateError } = await supabase
    .from("match_state")
    .update({
      scored_at: null,
      final_home_score: null,
      final_away_score: null,
    })
    .eq("match_id", matchId);

  if (stateError) {
    throw new Error(stateError.message);
  }
}

export async function getStoredMatchTweetId(matchId: number): Promise<string | null> {
  const state = await getMatchState(matchId);
  return state?.match_tweet_id?.trim() || null;
}

export async function saveMatchTweetId(
  matchId: number,
  tweetId: string,
  fixtureKey?: string,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existing = await getMatchState(matchId);
  const payload = {
    match_tweet_id: tweetId,
    match_fixture_key: fixtureKey ?? null,
  };

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update(payload)
      .eq("match_id", matchId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    ...payload,
  });

  if (error) throw new Error(error.message);
}

export async function clearMatchTweetId(matchId: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existing = await getMatchState(matchId);
  if (!existing?.match_tweet_id && !existing?.match_fixture_key) return;

  const { error } = await supabase
    .from("match_state")
    .update({ match_tweet_id: null, match_fixture_key: null })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
}

/** A goal captured from the live feed, oriented onto home/away sides. */
export type StoredGoal = {
  minute: number | null;
  side: "home" | "away";
  player: string | null;
  playerShort: string | null;
  ownGoal: boolean;
  penalty: boolean;
};

/** Stable per-goal key — must not include player (name may arrive on a later poll). */
function goalKey(goal: StoredGoal): string {
  return `${goal.side}|${goal.minute ?? "?"}|${goal.ownGoal ? 1 : 0}`;
}

function goalQuality(goal: StoredGoal): number {
  let score = 0;
  if (goal.player) score += 4;
  if (goal.minute != null) score += 2;
  if (goal.ownGoal) score += 1;
  if (goal.penalty) score += 1;
  return score;
}

function pickBetterGoal(a: StoredGoal, b: StoredGoal): StoredGoal {
  const qa = goalQuality(a);
  const qb = goalQuality(b);
  if (qb !== qa) return qb > qa ? b : a;
  return {
    side: a.side,
    minute: b.minute ?? a.minute,
    ownGoal: b.ownGoal || a.ownGoal,
    penalty: b.penalty || a.penalty,
    player: b.player ?? a.player,
    playerShort: b.playerShort ?? a.playerShort,
  };
}

/** One row per side+minute — keeps OG amends over the original scorer credit. */
function collapseBySideMinute(goals: StoredGoal[]): StoredGoal[] {
  const timed = new Map<string, StoredGoal>();
  const untimed: StoredGoal[] = [];

  for (const goal of goals) {
    if (goal.minute == null) {
      untimed.push(goal);
      continue;
    }
    const slot = `${goal.side}|${goal.minute}`;
    const prev = timed.get(slot);
    timed.set(slot, prev ? pickBetterGoal(prev, goal) : goal);
  }

  return [...untimed, ...timed.values()].sort(
    (a, b) => (a.minute ?? 0) - (b.minute ?? 0),
  );
}

/** Merge stored + fresh goals; prefer non-null scorer names and latest data. */
export function mergeMatchGoals(
  stored: StoredGoal[],
  fresh: StoredGoal[],
): StoredGoal[] {
  const byKey = new Map<string, StoredGoal>();

  for (const goal of [...stored, ...fresh]) {
    const key = goalKey(goal);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, goal);
      continue;
    }
    byKey.set(key, pickBetterGoal(prev, goal));
  }

  return collapseBySideMinute([...byKey.values()]);
}

/**
 * Drop vague stats-only rows when named goals exist, then align list length with
 * the live score so every goal slot is shown once per side.
 */
export function finalizeMatchGoals(
  goals: StoredGoal[],
  homeScore: number | null,
  awayScore: number | null,
): StoredGoal[] {
  const pickSide = (side: "home" | "away", target: number | null): StoredGoal[] => {
    if (target == null || target < 0) {
      return goals.filter((g) => g.side === side);
    }

    const ranked = goals
      .filter((g) => g.side === side)
      .sort((a, b) => {
        const quality = goalQuality(b) - goalQuality(a);
        if (quality !== 0) return quality;
        return (a.minute ?? 999) - (b.minute ?? 999);
      });

    const picked: StoredGoal[] = [];
    const usedMinutes = new Set<number>();

    for (const goal of ranked) {
      if (picked.length >= target) break;
      if (goal.minute != null && usedMinutes.has(goal.minute)) continue;
      if (goal.minute != null) usedMinutes.add(goal.minute);
      picked.push(goal);
    }

    for (const goal of ranked) {
      if (picked.length >= target) break;
      if (picked.includes(goal)) continue;
      picked.push(goal);
    }

    return picked.slice(0, target);
  };

  const home = pickSide("home", homeScore);
  const away = pickSide("away", awayScore);
  return [...home, ...away].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

/**
 * Accumulate goals for a fixture. The TxLINE snapshot only exposes the latest
 * goal at a time, so we persist each one we see (deduped) to build the full list
 * across polls. Idempotent — safe to call on every board refresh.
 */
export async function saveMatchGoals(
  fixtureId: number,
  goals: StoredGoal[],
): Promise<void> {
  if (goals.length === 0) return;

  const existing = await getMatchGoals(fixtureId).catch(() => [] as StoredGoal[]);
  const merged = mergeMatchGoals(existing, goals);
  const incomingKeys = new Set(goals.map(goalKey));
  const toWrite = merged.filter((goal) => incomingKeys.has(goalKey(goal)));
  if (toWrite.length === 0) return;

  const supabase = getSupabaseAdminClient();
  const rows = toWrite.map((goal) => ({
    fixture_id: fixtureId,
    goal_key: goalKey(goal),
    minute: goal.minute,
    side: goal.side,
    player: goal.player,
    own_goal: goal.ownGoal,
    is_penalty: goal.penalty,
  }));

  let { error } = await supabase
    .from("match_goals")
    .upsert(rows, { onConflict: "fixture_id,goal_key" });

  if (error?.message.includes("is_penalty")) {
    const legacyRows = rows.map(({ is_penalty: _ignored, ...row }) => row);
    ({ error } = await supabase
      .from("match_goals")
      .upsert(legacyRows, { onConflict: "fixture_id,goal_key" }));
  }

  if (error) throw new Error(error.message);
}

/**
 * Merge incoming goals with stored rows and upsert the full merged set.
 * Used by historical backfill — unlike {@link saveMatchGoals}, writes every
 * merged row, not only keys seen in the latest live poll.
 */
export async function upsertMatchGoals(
  fixtureId: number,
  goals: StoredGoal[],
): Promise<{ before: StoredGoal[]; after: StoredGoal[] }> {
  const existing = await getMatchGoals(fixtureId).catch(() => [] as StoredGoal[]);
  const merged = mergeMatchGoals(existing, goals);
  if (merged.length === 0) {
    return { before: existing, after: existing };
  }

  const supabase = getSupabaseAdminClient();
  const rows = merged.map((goal) => ({
    fixture_id: fixtureId,
    goal_key: goalKey(goal),
    minute: goal.minute,
    side: goal.side,
    player: goal.player,
    own_goal: goal.ownGoal,
    is_penalty: goal.penalty,
  }));

  let { error } = await supabase
    .from("match_goals")
    .upsert(rows, { onConflict: "fixture_id,goal_key" });

  if (error?.message.includes("is_penalty")) {
    const legacyRows = rows.map(({ is_penalty: _ignored, ...row }) => row);
    ({ error } = await supabase
      .from("match_goals")
      .upsert(legacyRows, { onConflict: "fixture_id,goal_key" }));
  }

  if (error) throw new Error(error.message);
  return { before: existing, after: merged };
}

/** All goals accumulated for a fixture, ordered by minute. */
export async function getMatchGoals(fixtureId: number): Promise<StoredGoal[]> {
  const supabase = getSupabaseAdminClient();
  const withPenalty = await supabase
    .from("match_goals")
    .select("minute, side, player, own_goal, is_penalty")
    .eq("fixture_id", fixtureId)
    .order("minute", { ascending: true });

  const loaded =
    withPenalty.error?.message.includes("is_penalty")
      ? await supabase
          .from("match_goals")
          .select("minute, side, player, own_goal")
          .eq("fixture_id", fixtureId)
          .order("minute", { ascending: true })
      : withPenalty;

  if (loaded.error) throw new Error(loaded.error.message);

  const rows = (loaded.data ?? []).map((row) => ({
    minute: row.minute as number | null,
    side: (row.side as "home" | "away") ?? "home",
    player: (row.player as string | null) ?? null,
    playerShort: null,
    ownGoal: Boolean(row.own_goal),
    penalty: Boolean((row as { is_penalty?: boolean }).is_penalty),
  }));

  return mergeMatchGoals(rows, []);
}

export type StoredMatchOdds = {
  homePct: number;
  drawPct: number;
  awayPct: number;
  lockedAt: string;
};

/**
 * Pre-kickoff 1X2 odds locked for scoring (first write wins — snapshot at lock).
 * Requires table: match_odds (fixture_id PK, home_pct, draw_pct, away_pct, locked_at).
 */
export async function saveMatchOdds(
  fixtureId: number,
  odds: Omit<StoredMatchOdds, "lockedAt">,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("match_odds").upsert(
    {
      fixture_id: fixtureId,
      home_pct: odds.homePct,
      draw_pct: odds.drawPct,
      away_pct: odds.awayPct,
      locked_at: new Date().toISOString(),
    },
    { onConflict: "fixture_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function getMatchOdds(fixtureId: number): Promise<StoredMatchOdds | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_odds")
    .select("home_pct, draw_pct, away_pct, locked_at")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    homePct: Number(data.home_pct),
    drawPct: Number(data.draw_pct),
    awayPct: Number(data.away_pct),
    lockedAt: data.locked_at as string,
  };
}

export type StoredMatchProof = {
  fixtureId: number;
  txFixtureId: number;
  seq: number;
  statKeys: number[];
  proofPayload: unknown;
  proofReference: string | null;
  proofTs: number | null;
  fetchedAt: string;
  semanticsMismatch: boolean;
  showVerifiedBadge: boolean;
  proofMode: ProofScoreMode | null;
  terminalStatusId: number | null;
  officialPayload: unknown | null;
  regulationPayload: unknown | null;
  officialSeq: number | null;
  regulationSeq: number | null;
  officialStatKeys: number[];
  regulationStatKeys: number[];
  seqSource: ProofSeqSource | null;
};

/** UI-facing summary derived from a stored TxLINE stat-validation proof. */
export type MatchProofSummary = {
  fixtureId: number;
  txFixtureId: number;
  seq: number;
  proofTs: number | null;
  proofReference: string | null;
  stats: Array<{ key: number; value: number; period: number }>;
  solanaExplorerUrl: string | null;
  fetchedAt: string;
  showVerifiedBadge: boolean;
  semanticsMismatch: boolean;
  proofMode: ProofScoreMode | null;
  verificationCopy: string | null;
  officialStats: Array<{ key: number; value: number; period: number }>;
  regulationStats: Array<{ key: number; value: number; period: number }>;
  officialSeq: number | null;
  regulationSeq: number | null;
  seqSource: ProofSeqSource | null;
};

function parseStatKeys(value: unknown): number[] {
  if (value == null) return [];
  return String(value)
    .split(",")
    .map((key) => Number.parseInt(key.trim(), 10))
    .filter((key) => Number.isFinite(key));
}

function mapStoredMatchProofRow(data: Record<string, unknown>): StoredMatchProof {
  const regulationPayload =
    data.regulation_payload ?? data.proof_payload ?? null;
  const officialPayload = data.official_payload ?? null;

  return {
    fixtureId: Number(data.fixture_id),
    txFixtureId: Number(data.tx_fixture_id),
    seq: Number(data.regulation_seq ?? data.seq),
    statKeys: parseStatKeys(data.regulation_stat_keys ?? data.stat_keys),
    proofPayload: regulationPayload,
    proofReference: (data.proof_reference as string | null) ?? null,
    proofTs: data.proof_ts != null ? Number(data.proof_ts) : null,
    fetchedAt: data.fetched_at as string,
    semanticsMismatch: Boolean(data.semantics_mismatch),
    showVerifiedBadge: Boolean(data.show_verified_badge),
    proofMode:
      data.proof_mode === "regulation" || data.proof_mode === "total"
        ? data.proof_mode
        : null,
    terminalStatusId:
      data.terminal_status_id != null ? Number(data.terminal_status_id) : null,
    officialPayload,
    regulationPayload,
    officialSeq:
      data.official_seq != null ? Number(data.official_seq) : null,
    regulationSeq:
      data.regulation_seq != null
        ? Number(data.regulation_seq)
        : Number(data.seq),
    officialStatKeys: parseStatKeys(data.official_stat_keys),
    regulationStatKeys: parseStatKeys(
      data.regulation_stat_keys ?? data.stat_keys,
    ),
    seqSource:
      data.seq_source === "game_finalised" ||
      data.seq_source === "terminal_fallback"
        ? data.seq_source
        : null,
  };
}

export async function saveMatchProof(input: {
  fixtureId: number;
  txFixtureId: number;
  seq: number;
  statKeys: number[];
  proofPayload: unknown;
  proofReference?: string | null;
  proofTs?: number | null;
  semanticsMismatch?: boolean;
  showVerifiedBadge?: boolean;
  proofMode?: ProofScoreMode | null;
  terminalStatusId?: number | null;
  officialPayload?: unknown | null;
  regulationPayload?: unknown | null;
  officialSeq?: number | null;
  regulationSeq?: number | null;
  officialStatKeys?: number[];
  regulationStatKeys?: number[];
  seqSource?: ProofSeqSource | null;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const regulationPayload = input.regulationPayload ?? input.proofPayload;
  const regulationSeq = input.regulationSeq ?? input.seq;
  const regulationStatKeys = input.regulationStatKeys ?? input.statKeys;

  const row: Record<string, unknown> = {
    fixture_id: input.fixtureId,
    tx_fixture_id: input.txFixtureId,
    seq: regulationSeq,
    stat_keys: regulationStatKeys.join(","),
    proof_payload: regulationPayload,
    proof_reference: input.proofReference ?? null,
    proof_ts: input.proofTs ?? null,
    fetched_at: new Date().toISOString(),
    semantics_mismatch: input.semanticsMismatch ?? false,
    show_verified_badge: input.showVerifiedBadge ?? false,
    proof_mode: input.proofMode ?? null,
    terminal_status_id: input.terminalStatusId ?? null,
    official_payload: input.officialPayload ?? null,
    regulation_payload: regulationPayload,
    official_seq: input.officialSeq ?? null,
    regulation_seq: regulationSeq,
    official_stat_keys: input.officialStatKeys?.length
      ? input.officialStatKeys.join(",")
      : null,
    regulation_stat_keys: regulationStatKeys.join(","),
    seq_source: input.seqSource ?? null,
  };

  let { error } = await supabase.from("match_proofs").upsert(row, {
    onConflict: "fixture_id",
  });

  const dualColumnKeys = [
    "official_payload",
    "regulation_payload",
    "official_seq",
    "regulation_seq",
    "official_stat_keys",
    "regulation_stat_keys",
    "seq_source",
  ] as const;

  const semanticsColumnKeys = [
    "semantics_mismatch",
    "show_verified_badge",
    "proof_mode",
    "terminal_status_id",
  ] as const;

  const isMissingColumn = (message: string, keys: readonly string[]) =>
    keys.some((key) => message.includes(key));

  if (error && isMissingColumn(error.message, dualColumnKeys)) {
    const withoutDual = { ...row };
    for (const key of dualColumnKeys) {
      delete withoutDual[key];
    }
    ({ error } = await supabase.from("match_proofs").upsert(withoutDual, {
      onConflict: "fixture_id",
    }));
  }

  if (error && isMissingColumn(error.message, semanticsColumnKeys)) {
    const legacy: Record<string, unknown> = {
      fixture_id: row.fixture_id,
      tx_fixture_id: row.tx_fixture_id,
      seq: row.seq,
      stat_keys: row.stat_keys,
      proof_payload: row.proof_payload,
      proof_reference: row.proof_reference,
      proof_ts: row.proof_ts,
      fetched_at: row.fetched_at,
    };
    ({ error } = await supabase.from("match_proofs").upsert(legacy, {
      onConflict: "fixture_id",
    }));
  }

  if (error) throw new Error(error.message);
}

export async function getMatchProof(fixtureId: number): Promise<StoredMatchProof | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_proofs")
    .select("*")
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapStoredMatchProofRow(data as Record<string, unknown>);
}

export async function getMatchProofByTxFixtureId(
  txFixtureId: number,
): Promise<StoredMatchProof | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_proofs")
    .select("*")
    .eq("tx_fixture_id", txFixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapStoredMatchProofRow(data as Record<string, unknown>);
}

export function toMatchProofSummary(stored: StoredMatchProof): MatchProofSummary {
  const regulationPayload = stored.regulationPayload ?? stored.proofPayload;
  const officialPayload = stored.officialPayload;
  const payload = regulationPayload as {
    summary?: { updateStats?: { minTimestamp?: number } };
  };
  const minTs = payload.summary?.updateStats?.minTimestamp;
  const solanaExplorerUrl =
    typeof minTs === "number"
      ? solanaExplorerAddressUrl(dailyScoresMerkleRootsPda(minTs).toBase58())
      : null;

  const regulationStats = statsFromProofPayload(regulationPayload);
  const officialStats = officialPayload
    ? statsFromProofPayload(officialPayload)
    : [];

  return {
    fixtureId: stored.fixtureId,
    txFixtureId: stored.txFixtureId,
    seq: stored.regulationSeq ?? stored.seq,
    proofTs: stored.proofTs,
    proofReference: stored.proofReference,
    stats: regulationStats,
    solanaExplorerUrl,
    fetchedAt: stored.fetchedAt,
    showVerifiedBadge: stored.showVerifiedBadge,
    semanticsMismatch: stored.semanticsMismatch,
    proofMode: stored.proofMode,
    verificationCopy: dualProofPopoverIntro(),
    officialStats,
    regulationStats,
    officialSeq: stored.officialSeq,
    regulationSeq: stored.regulationSeq ?? stored.seq,
    seqSource: stored.seqSource,
  };
}

export async function getMatchProofSummary(
  lookup: { fixtureId?: number; txFixtureId?: number },
): Promise<MatchProofSummary | null> {
  const stored =
    lookup.fixtureId != null
      ? await getMatchProof(lookup.fixtureId).catch(() => null)
      : null;
  const resolved =
    stored ??
    (lookup.txFixtureId != null
      ? await getMatchProofByTxFixtureId(lookup.txFixtureId).catch(() => null)
      : null);
  if (!resolved) return null;
  return toMatchProofSummary(resolved);
}

/** Stored proofs that anchored at terminal StatusId and may upgrade when game_finalised appears. */
export async function listTerminalFallbackMatchProofs(): Promise<StoredMatchProof[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_proofs")
    .select("*")
    .eq("seq_source", "terminal_fallback");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) =>
    mapStoredMatchProofRow(row as Record<string, unknown>),
  );
}

export async function getMatchProofSummariesForTxFixtures(
  txFixtureIds: number[],
): Promise<Map<number, MatchProofSummary>> {
  const unique = [...new Set(txFixtureIds.filter((id) => id > 0))];
  const map = new Map<number, MatchProofSummary>();
  if (unique.length === 0) return map;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_proofs")
    .select("*")
    .in("tx_fixture_id", unique);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const stored = mapStoredMatchProofRow(row as Record<string, unknown>);
    map.set(stored.txFixtureId, toMatchProofSummary(stored));
  }

  return map;
}

export async function getMatchState(matchId: number): Promise<MatchStateRow | null> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("match_state")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as MatchStateRow | null;
}

export async function markMatchCollected(matchId: number): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const existing = await getMatchState(matchId);

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update({ predictions_collected_at: now })
      .eq("match_id", matchId);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    predictions_collected_at: now,
  });

  if (error) throw new Error(error.message);
}

export async function isMatchCollected(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  return Boolean(state?.predictions_collected_at);
}

export async function countPredictionsForMatch(matchId: number): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("predictions")
    .select("*", { count: "exact", head: true })
    .eq("match_id", matchId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** True when collection finished and at least one prediction row exists. */
export async function isEffectivelyCollected(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  if (!state?.predictions_collected_at) return false;
  return (await countPredictionsForMatch(matchId)) > 0;
}

export type ScoredPrediction = {
  user_id: string;
  user_handle: string;
  home_score: number;
  away_score: number;
  points: number;
};

export type ScoreMatchResult = {
  matchId: number;
  finalScore: MatchScore;
  predictionsScored: number;
  breakdown: {
    exact: number;
    outcome: number;
    participation: number;
  };
};

async function updatePredictionPoints(
  supabase: SupabaseClient,
  userId: string,
  matchId: number,
  scored: ReturnType<typeof scorePredictionDetailed>,
  extra?: Record<string, unknown>,
): Promise<void> {
  const payload: Record<string, unknown> = {
    points: scored.points,
    score_base: scored.base,
    score_multiplier: scored.multiplier,
    ...extra,
  };

  let { error } = await supabase
    .from("predictions")
    .update(payload)
    .eq("user_id", userId)
    .eq("match_id", matchId);

  if (
    error &&
    (error.message.includes("score_base") || error.message.includes("score_multiplier"))
  ) {
    const { score_base: _b, score_multiplier: _m, points, ...rest } = payload;
    ({ error } = await supabase
      .from("predictions")
      .update({ points, ...rest })
      .eq("user_id", userId)
      .eq("match_id", matchId));
  }

  if (error?.message.includes("replied_at")) {
    const { replied_at: _r, ...withoutReplied } = payload;
    ({ error } = await supabase
      .from("predictions")
      .update({
        points: scored.points,
        score_base: scored.base,
        score_multiplier: scored.multiplier,
        ...Object.fromEntries(
          Object.entries(withoutReplied).filter(([k]) => k !== "replied_at"),
        ),
      })
      .eq("user_id", userId)
      .eq("match_id", matchId));
  }

  if (
    error &&
    (error.message.includes("score_base") || error.message.includes("score_multiplier"))
  ) {
    ({ error } = await supabase
      .from("predictions")
      .update({ points: scored.points })
      .eq("user_id", userId)
      .eq("match_id", matchId));
  }

  if (error) throw new Error(error.message);
}

async function scoreStoredPredictionsOnly(
  supabase: SupabaseClient,
  matchId: number,
  fixture: Fixture,
  finalScore: MatchScore,
  predictions: Array<{
    user_id: string;
    user_handle: string;
    home_score: number;
    away_score: number;
    replied_at?: string | null;
  }>,
  odds: { homePct: number; drawPct: number; awayPct: number } | null,
): Promise<Pick<ScoreMatchResult, "predictionsScored" | "breakdown">> {
  const breakdown = { exact: 0, outcome: 0, participation: 0 };
  let predictionsScored = 0;

  const updates = predictions.map(async (row) => {
    if (
      row.replied_at &&
      !isReplyBeforeKickoff(row.replied_at, fixture)
    ) {
      const { error: clearError } = await supabase
        .from("predictions")
        .update({ points: null })
        .eq("user_id", row.user_id)
        .eq("match_id", matchId);

      if (clearError) throw new Error(clearError.message);
      return null;
    }

    const scored = scorePredictionDetailed(
      { homeScore: row.home_score, awayScore: row.away_score },
      finalScore,
      odds,
    );

    await updatePredictionPoints(supabase, row.user_id, matchId, scored);
    return scored;
  });

  for (const scored of await Promise.all(updates)) {
    if (scored === null) continue;
    const bucket = tierToBreakdownBucket(scored.tier);
    breakdown[bucket] += 1;
    predictionsScored += 1;
  }

  return { predictionsScored, breakdown };
}

async function persistMatchFinalScore(
  supabase: SupabaseClient,
  matchId: number,
  finalScore: MatchScore,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getMatchState(matchId);
  const payload = {
    scored_at: now,
    final_home_score: finalScore.homeScore,
    final_away_score: finalScore.awayScore,
  };

  if (existing) {
    const { error } = await supabase
      .from("match_state")
      .update(payload)
      .eq("match_id", matchId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("match_state").insert({
    match_id: matchId,
    ...payload,
  });
  if (error) throw new Error(error.message);
}

async function oddsForScoring(fixture: Fixture): Promise<Match1x2Odds | null> {
  const fromRegistry = await getMatchOdds(fixture.id).catch(() => null);
  if (fromRegistry) {
    return {
      homePct: fromRegistry.homePct,
      drawPct: fromRegistry.drawPct,
      awayPct: fromRegistry.awayPct,
    };
  }

  const txFixtureId = fixture.externalFixtureId;
  if (txFixtureId != null && txFixtureId !== fixture.id) {
    const fromTx = await getMatchOdds(txFixtureId).catch(() => null);
    if (fromTx) {
      const odds: Match1x2Odds = {
        homePct: fromTx.homePct,
        drawPct: fromTx.drawPct,
        awayPct: fromTx.awayPct,
      };
      try {
        await saveMatchOdds(fixture.id, odds);
      } catch {
        /* optional migration of legacy TxLINE-keyed rows */
      }
      return odds;
    }
  }

  return null;
}

export async function scoreMatchPredictions(
  matchId: number,
  finalScore: MatchScore,
  fixtureOverride?: Fixture,
): Promise<ScoreMatchResult> {
  const supabase = getSupabaseAdminClient();
  const fixture = fixtureOverride ?? getFixtureById(matchId);

  if (!fixture) {
    throw new Error(`Unknown matchId: ${matchId}`);
  }

  const odds = await oddsForScoring(fixture);
  const matchState = await getMatchState(matchId);

  const { data: predictions, error: fetchError } = await supabase
    .from("predictions")
    .select("user_id, user_handle, home_score, away_score, replied_at")
    .eq("match_id", matchId);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (matchState?.predictions_collected_at) {
    const { predictionsScored, breakdown } = await scoreStoredPredictionsOnly(
      supabase,
      matchId,
      fixture,
      finalScore,
      predictions ?? [],
      odds,
    );

    await persistMatchFinalScore(supabase, matchId, finalScore);

    return {
      matchId,
      finalScore,
      predictionsScored,
      breakdown,
    };
  }

  // API auto-settle before X collection: record FT now; rescore when replies arrive.
  if ((predictions ?? []).length === 0) {
    await persistMatchFinalScore(supabase, matchId, finalScore);
    return {
      matchId,
      finalScore,
      predictionsScored: 0,
      breakdown: { exact: 0, outcome: 0, participation: 0 },
    };
  }

  const eligible = await loadEligiblePreKickoffPredictions(fixture);

  const breakdown = { exact: 0, outcome: 0, participation: 0 };
  let predictionsScored = 0;

  for (const row of predictions ?? []) {
    const eligiblePrediction = eligible.get(row.user_id);

    if (!eligiblePrediction) {
      const { error: clearError } = await supabase
        .from("predictions")
        .update({ points: null })
        .eq("user_id", row.user_id)
        .eq("match_id", matchId);

      if (clearError) {
        throw new Error(clearError.message);
      }
      continue;
    }

    const scored = scorePredictionDetailed(
      {
        homeScore: eligiblePrediction.homeScore,
        awayScore: eligiblePrediction.awayScore,
      },
      finalScore,
      odds,
    );

    breakdown[tierToBreakdownBucket(scored.tier)] += 1;

    await updatePredictionPoints(supabase, row.user_id, matchId, scored, {
      home_score: eligiblePrediction.homeScore,
      away_score: eligiblePrediction.awayScore,
      user_handle: eligiblePrediction.userHandle,
      replied_at: eligiblePrediction.repliedAt,
    });

    predictionsScored += 1;
  }

  for (const eligiblePrediction of eligible.values()) {
    const alreadyStored = predictions?.some(
      (row) => row.user_id === eligiblePrediction.userId,
    );
    if (alreadyStored) continue;

    await savePrediction({
      user_id: eligiblePrediction.userId,
      user_handle: eligiblePrediction.userHandle,
      match_id: matchId,
      home_score: eligiblePrediction.homeScore,
      away_score: eligiblePrediction.awayScore,
      replied_at: eligiblePrediction.repliedAt,
    });

    const scored = scorePredictionDetailed(
      {
        homeScore: eligiblePrediction.homeScore,
        awayScore: eligiblePrediction.awayScore,
      },
      finalScore,
      odds,
    );

    breakdown[tierToBreakdownBucket(scored.tier)] += 1;

    await updatePredictionPoints(
      supabase,
      eligiblePrediction.userId,
      matchId,
      scored,
    );

    predictionsScored += 1;
  }

  await persistMatchFinalScore(supabase, matchId, finalScore);

  return {
    matchId,
    finalScore,
    predictionsScored,
    breakdown,
  };
}

export async function isMatchScored(matchId: number): Promise<boolean> {
  const state = await getMatchState(matchId);
  return Boolean(state?.scored_at);
}

/** Award points when predictions were collected after an API auto-score. */
export async function rescoreCollectedMatch(
  matchId: number,
): Promise<ScoreMatchResult | null> {
  const state = await getMatchState(matchId);
  if (
    !state?.scored_at ||
    !state.predictions_collected_at ||
    state.final_home_score == null ||
    state.final_away_score == null
  ) {
    return null;
  }

  const fixture = getFixtureById(matchId);
  if (!fixture) return null;

  const finalScore: MatchScore = {
    homeScore: state.final_home_score,
    awayScore: state.final_away_score,
  };

  return scoreMatchPredictions(matchId, finalScore, fixture);
}

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  user_handle: string;
  total_points: number;
};

export async function getLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("predictions")
    .select("user_id, user_handle, match_id, points, replied_at")
    .not("points", "is", null);

  if (error?.message.includes("replied_at")) {
    const fallback = await supabase
      .from("predictions")
      .select("user_id, user_handle, match_id, points")
      .not("points", "is", null);

    if (fallback.error) {
      throw new Error(fallback.error.message);
    }

    return rankLeaderboardRows(
      (fallback.data ?? []).map((row) => ({ ...row, replied_at: null })),
      limit,
    );
  }

  if (error) {
    throw new Error(error.message);
  }

  return rankLeaderboardRows(data ?? [], limit);
}

function rankLeaderboardRows(
  rows: Array<{
    user_id: string;
    user_handle: string;
    match_id?: number;
    points: number | null;
    replied_at?: string | null;
  }>,
  limit?: number,
): LeaderboardEntry[] {
  const totals = new Map<
    string,
    {
      user_id: string;
      user_handle: string;
      total_points: number;
      earliest_reply: string | null;
    }
  >();

  for (const row of rows) {
    if (row.points === null || row.points === undefined) continue;

    const existing = totals.get(row.user_id);
    if (existing) {
      existing.total_points += row.points;
      existing.user_handle = row.user_handle;
      if (
        row.replied_at &&
        (!existing.earliest_reply || row.replied_at < existing.earliest_reply)
      ) {
        existing.earliest_reply = row.replied_at;
      }
    } else {
      totals.set(row.user_id, {
        user_id: row.user_id,
        user_handle: row.user_handle,
        total_points: row.points,
        earliest_reply: row.replied_at ?? null,
      });
    }
  }

  const sorted = [...totals.values()].sort(
    (a, b) =>
      b.total_points - a.total_points ||
      (a.earliest_reply ?? "9999").localeCompare(b.earliest_reply ?? "9999") ||
      a.user_handle.localeCompare(b.user_handle),
  );

  const ranked = sorted.map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    user_handle: entry.user_handle,
    total_points: entry.total_points,
  }));

  return limit ? ranked.slice(0, limit) : ranked;
}

export type UserScoreBreakdown = {
  match_id: number;
  home: string;
  away: string;
  prediction: { home: number; away: number };
  final: { home: number; away: number } | null;
  base: number;
  multiplier: number;
  points: number;
};

export async function getUserScoringExtras(userId: string): Promise<{
  upsetBonusTotal: number;
  lastBreakdown: UserScoreBreakdown | null;
}> {
  const supabase = getSupabaseAdminClient();

  type PredictionScoreRow = {
    match_id: number;
    home_score: number;
    away_score: number;
    points: number;
    score_base?: number | null;
    score_multiplier?: number | null;
    replied_at?: string | null;
  };

  const selectWithBreakdown =
    "match_id, home_score, away_score, points, score_base, score_multiplier, replied_at";
  const first = await supabase
    .from("predictions")
    .select(selectWithBreakdown)
    .eq("user_id", userId)
    .not("points", "is", null);

  let rows: PredictionScoreRow[] = (first.data ?? []) as PredictionScoreRow[];
  let error = first.error;

  if (error?.message.includes("score_base")) {
    const fallback = await supabase
      .from("predictions")
      .select("match_id, home_score, away_score, points, replied_at")
      .eq("user_id", userId)
      .not("points", "is", null);
    rows = (fallback.data ?? []) as PredictionScoreRow[];
    error = fallback.error;
  }

  if (error) throw new Error(error.message);

  const data = rows;

  let upsetBonusTotal = 0;
  for (const row of rows) {
    const base = row.score_base ?? row.points;
    const mult = row.score_multiplier ?? 1;
    if (mult > 1 && row.points > base) {
      upsetBonusTotal += row.points - base;
    }
  }

  const sorted = [...rows].sort((a, b) =>
    (b.replied_at ?? "").localeCompare(a.replied_at ?? ""),
  );
  const latest = sorted[0];
  if (!latest) {
    return { upsetBonusTotal, lastBreakdown: null };
  }

  const state = await getMatchState(latest.match_id);
  const fixture = getFixtureById(latest.match_id);
  const base = latest.score_base ?? latest.points;
  const multiplier = latest.score_multiplier ?? 1;
  const home =
    state?.home_team?.trim() || fixture?.home || "Home team";
  const away =
    state?.away_team?.trim() || fixture?.away || "Away team";

  return {
    upsetBonusTotal,
    lastBreakdown: {
      match_id: latest.match_id,
      home,
      away,
      prediction: { home: latest.home_score, away: latest.away_score },
      final:
        state?.final_home_score != null && state?.final_away_score != null
          ? { home: state.final_home_score, away: state.final_away_score }
          : null,
      base,
      multiplier,
      points: latest.points,
    },
  };
}
