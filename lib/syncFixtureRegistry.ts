import {
  FIXTURES,
  fixtureCacheKey,
  fixtureDateTime,
  type Fixture,
} from "../app/data/fixtures";
import { getSupabaseAdminClient } from "../app/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

async function upsertMatchStateRow(
  supabase: SupabaseClient,
  matchId: number,
  payload: Record<string, string>,
  mode: "insert" | "update",
): Promise<string | null> {
  const minimal = { match_fixture_key: payload.match_fixture_key };
  const full = { ...payload };

  for (const attempt of [full, minimal] as const) {
    const { error } =
      mode === "insert"
        ? await supabase.from("match_state").insert({
            match_id: matchId,
            ...attempt,
          })
        : await supabase
            .from("match_state")
            .update(attempt)
            .eq("match_id", matchId);

    if (!error) return null;
    if (
      !error.message.includes("home_team") &&
      !error.message.includes("away_team") &&
      !error.message.includes("kickoff_at")
    ) {
      return error.message;
    }
  }

  return "Failed to write match_state";
}

export type SyncFixtureRegistryResult = {
  expectedMatchIds: number[];
  registeredMatchIds: number[];
  created: number[];
  updated: number[];
  skipped: Array<{ matchId: number; reason: string }>;
  errors: Array<{ matchId: number; error: string }>;
};

/**
 * Ensures every fixture in app/data/fixtures.ts has a match_state row in Supabase.
 * Safe to run repeatedly — does not clear predictions, scores, or tweet ids.
 */
export async function syncFixtureRegistryToSupabase(
  fixtures: Fixture[] = FIXTURES,
): Promise<SyncFixtureRegistryResult> {
  const supabase = getSupabaseAdminClient();
  const expectedMatchIds = fixtures.map((f) => f.id);
  const created: number[] = [];
  const updated: number[] = [];
  const skipped: Array<{ matchId: number; reason: string }> = [];
  const errors: Array<{ matchId: number; error: string }> = [];

  for (const fixture of fixtures) {
    try {
      const newKey = fixtureCacheKey(fixture);
      const { data: existing, error: readError } = await supabase
        .from("match_state")
        .select(
          "match_id, match_fixture_key, predictions_collected_at, scored_at",
        )
        .eq("match_id", fixture.id)
        .maybeSingle();

      if (readError) {
        throw new Error(readError.message);
      }

      if (existing) {
        const priorKey = existing.match_fixture_key?.trim() ?? "";
        const hasHistory =
          Boolean(existing.predictions_collected_at) ||
          Boolean(existing.scored_at);

        if (priorKey && priorKey !== newKey && hasHistory) {
          skipped.push({
            matchId: fixture.id,
            reason: `Refusing to overwrite ${priorKey} with ${newKey} — use a new match_id for each match day`,
          });
          continue;
        }
      }

      const payload: Record<string, string> = {
        match_fixture_key: newKey,
      };

      // Optional columns — run supabase/schema.sql if these are missing.
      payload.home_team = fixture.home;
      payload.away_team = fixture.away;
      payload.kickoff_at = fixtureDateTime(fixture).toISOString();

      if (existing) {
        const updateError = await upsertMatchStateRow(
          supabase,
          fixture.id,
          payload,
          "update",
        );
        if (updateError) throw new Error(updateError);
        updated.push(fixture.id);
      } else {
        const insertError = await upsertMatchStateRow(
          supabase,
          fixture.id,
          payload,
          "insert",
        );
        if (insertError) throw new Error(insertError);
        created.push(fixture.id);
      }
    } catch (error) {
      errors.push({
        matchId: fixture.id,
        error: error instanceof Error ? error.message : "Registry sync failed",
      });
    }
  }

  const { data: rows, error: listError } = await supabase
    .from("match_state")
    .select("match_id")
    .in("match_id", expectedMatchIds);

  if (listError) {
    throw new Error(listError.message);
  }

  const registeredMatchIds = (rows ?? [])
    .map((row) => row.match_id as number)
    .sort((a, b) => a - b);

  return {
    expectedMatchIds,
    registeredMatchIds,
    created,
    updated,
    skipped,
    errors,
  };
}

export function registryGap(
  result: SyncFixtureRegistryResult,
): number[] {
  const registered = new Set(result.registeredMatchIds);
  return result.expectedMatchIds.filter((id) => !registered.has(id));
}
