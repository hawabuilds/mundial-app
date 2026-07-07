import {
  FIXTURES,
  type Fixture,
} from "@/app/data/fixtures";
import {
  FIXTURE_STATUS_NEEDS_THREAD,
  FIXTURE_STATUS_READY,
} from "@/lib/fixtureLifecycle";
import {
  diffTxlineFixtures,
  fixtureFromRegistryDraft,
  type TxlineFixtureDraft,
  type TxlineRegistryRow,
} from "@/lib/txlineFixtureSync";
import { fetchFixturesSnapshot, isTxoddsConfigured } from "@/lib/txodds";
import { getSupabaseAdminClient } from "@/app/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncNewFixturesResult = {
  inserted: Array<{
    matchId: number;
    txFixtureId: number;
    home: string;
    away: string;
    kickoffAt: string;
    fixtureStatus: typeof FIXTURE_STATUS_NEEDS_THREAD;
  }>;
  updated: Array<{
    matchId: number;
    txFixtureId: number;
    changes: string[];
  }>;
  skipped: Array<{ txFixtureId: number; reason: string }>;
  errors: Array<{ txFixtureId: number; error: string }>;
  awaitingTweet: Array<{
    matchId: number;
    txFixtureId: number;
    home: string;
    away: string;
    kickoffAt: string | null;
    competition: string | null;
  }>;
};

async function loadRegistryRows(
  supabase: SupabaseClient,
): Promise<TxlineRegistryRow[]> {
  const { data, error } = await supabase
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, predictions_collected_at, scored_at",
    )
    .not("tx_fixture_id", "is", null);

  if (error) throw new Error(error.message);

  const matchIds = (data ?? [])
    .map((row) => Number(row.match_id))
    .filter((id) => id > 0);

  const predictionCounts = new Map<number, number>();
  if (matchIds.length > 0) {
    const { data: predictions, error: predError } = await supabase
      .from("predictions")
      .select("match_id")
      .in("match_id", matchIds);
    if (predError) throw new Error(predError.message);
    for (const row of predictions ?? []) {
      const id = Number(row.match_id);
      predictionCounts.set(id, (predictionCounts.get(id) ?? 0) + 1);
    }
  }

  return (data ?? []).map((raw) => {
    const matchId = Number(raw.match_id);
    const txFixtureId = Number(raw.tx_fixture_id);
    return {
      matchId,
      txFixtureId,
      homeTeam: (raw.home_team as string | null) ?? null,
      awayTeam: (raw.away_team as string | null) ?? null,
      kickoffAt: (raw.kickoff_at as string | null) ?? null,
      competition: (raw.competition as string | null) ?? null,
      predictionsCollectedAt:
        (raw.predictions_collected_at as string | null) ?? null,
      scoredAt: (raw.scored_at as string | null) ?? null,
      predictionCount: predictionCounts.get(matchId) ?? 0,
    };
  });
}

async function insertDraft(
  supabase: SupabaseClient,
  draft: TxlineFixtureDraft,
): Promise<string | null> {
  const { data: existing, error: readError } = await supabase
    .from("match_state")
    .select("match_id")
    .or(`match_id.eq.${draft.matchId},tx_fixture_id.eq.${draft.txFixtureId}`)
    .limit(1);

  if (readError) return readError.message;
  if (existing && existing.length > 0) return null;

  const { error } = await supabase.from("match_state").insert({
    match_id: draft.matchId,
    tx_fixture_id: draft.txFixtureId,
    home_team: draft.home,
    away_team: draft.away,
    kickoff_at: draft.kickoffAt,
    competition: draft.competition,
    match_fixture_key: draft.fixtureKey,
    fixture_status: FIXTURE_STATUS_NEEDS_THREAD,
  });

  return error?.message ?? null;
}

async function updateDraft(
  supabase: SupabaseClient,
  matchId: number,
  draft: TxlineFixtureDraft,
): Promise<string | null> {
  const { error } = await supabase
    .from("match_state")
    .update({
      home_team: draft.home,
      away_team: draft.away,
      kickoff_at: draft.kickoffAt,
      competition: draft.competition,
      match_fixture_key: draft.fixtureKey,
      tx_fixture_id: draft.txFixtureId,
    })
    .eq("match_id", matchId);

  return error?.message ?? null;
}

/** List auto-inserted fixtures still awaiting an X thread id. */
export async function listFixturesAwaitingTweet(): Promise<
  SyncNewFixturesResult["awaitingTweet"]
> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, match_tweet_id, fixture_status",
    )
    .eq("fixture_status", FIXTURE_STATUS_NEEDS_THREAD)
    .is("match_tweet_id", null)
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    matchId: Number(row.match_id),
    txFixtureId: Number(row.tx_fixture_id ?? row.match_id),
    home: String(row.home_team ?? ""),
    away: String(row.away_team ?? ""),
    kickoffAt: (row.kickoff_at as string | null) ?? null,
    competition: (row.competition as string | null) ?? null,
  }));
}

/** Auto-discovered fixtures with a registered tweet id (eligible for collection). */
export async function loadAutoFixturesWithTweet(): Promise<Fixture[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("match_state")
    .select(
      "match_id, tx_fixture_id, home_team, away_team, kickoff_at, competition, match_tweet_id",
    )
    .not("tx_fixture_id", "is", null)
    .not("match_tweet_id", "is", null);

  if (error) throw new Error(error.message);

  const fixtures: Fixture[] = [];
  for (const row of data ?? []) {
    const txFixtureId = Number(row.tx_fixture_id);
    if (txFixtureId <= 0) continue;
    const kickoffAt = (row.kickoff_at as string | null) ?? null;
    if (!kickoffAt) continue;
    const iso = new Date(kickoffAt).toISOString();
    fixtures.push(
      fixtureFromRegistryDraft({
        txFixtureId,
        matchId: Number(row.match_id),
        home: String(row.home_team ?? ""),
        away: String(row.away_team ?? ""),
        date: iso.slice(0, 10),
        time: iso.slice(11, 16),
        kickoffAt: iso,
        competition: String(row.competition ?? "FIFA World Cup"),
        group: String(row.competition ?? "FIFA World Cup"),
        fixtureKey: `${row.home_team}|${row.away_team}|${iso.slice(0, 10)}`,
      }),
    );
  }
  return fixtures;
}

export async function getCollectionFixtureSlate(): Promise<Fixture[]> {
  const staticActive = FIXTURES.filter((f) => !f.cancelled);
  const staticIds = new Set(staticActive.map((f) => f.id));
  const autoWithTweet = await loadAutoFixturesWithTweet();
  const merged = [...staticActive];
  for (const fixture of autoWithTweet) {
    if (!staticIds.has(fixture.id)) merged.push(fixture);
  }
  return merged;
}

/** Backfill tx_fixture_id on static registry rows when missing. */
export async function backfillStaticTxFixtureIds(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  let updated = 0;
  for (const fixture of FIXTURES) {
    if (!fixture.externalFixtureId) continue;
    const { data: existing } = await supabase
      .from("match_state")
      .select("match_id, tx_fixture_id")
      .eq("match_id", fixture.id)
      .maybeSingle();
    if (!existing || existing.tx_fixture_id) continue;
    const { error } = await supabase
      .from("match_state")
      .update({
        tx_fixture_id: fixture.externalFixtureId,
        fixture_status: FIXTURE_STATUS_READY,
      })
      .eq("match_id", fixture.id);
    if (!error) updated += 1;
  }
  return updated;
}

/**
 * Poll TxLINE fixtures snapshot and insert/update registry rows.
 * Idempotent — safe on a 30-minute cron schedule.
 */
export async function syncNewFixturesFromTxline(): Promise<SyncNewFixturesResult> {
  const result: SyncNewFixturesResult = {
    inserted: [],
    updated: [],
    skipped: [],
    errors: [],
    awaitingTweet: [],
  };

  if (!isTxoddsConfigured()) {
    result.skipped.push({
      txFixtureId: 0,
      reason: "TxODDS not configured",
    });
    result.awaitingTweet = await listFixturesAwaitingTweet().catch(() => []);
    return result;
  }

  const supabase = getSupabaseAdminClient();
  await backfillStaticTxFixtureIds();
  const snapshot = await fetchFixturesSnapshot({ fresh: true });
  const registryRows = await loadRegistryRows(supabase);
  const diff = diffTxlineFixtures(snapshot, FIXTURES, registryRows);

  for (const draft of diff.toInsert) {
    const insertError = await insertDraft(supabase, draft);
    if (insertError) {
      result.errors.push({ txFixtureId: draft.txFixtureId, error: insertError });
      continue;
    }
    result.inserted.push({
      matchId: draft.matchId,
      txFixtureId: draft.txFixtureId,
      home: draft.home,
      away: draft.away,
      kickoffAt: draft.kickoffAt,
      fixtureStatus: FIXTURE_STATUS_NEEDS_THREAD,
    });
  }

  for (const item of diff.toUpdate) {
    const updateError = await updateDraft(supabase, item.matchId, item.draft);
    if (updateError) {
      result.errors.push({
        txFixtureId: item.draft.txFixtureId,
        error: updateError,
      });
      continue;
    }
    result.updated.push({
      matchId: item.matchId,
      txFixtureId: item.draft.txFixtureId,
      changes: item.changes,
    });
  }

  result.skipped.push(...diff.skipped);
  result.awaitingTweet = await listFixturesAwaitingTweet();
  return result;
}
