import { getSupabaseAdminClient } from "@/app/lib/supabase";
import {
  mergePenaltyShootout,
  type PenaltyKick,
  type PenaltyShootout,
} from "./penaltyShootout";

function kickKey(kick: Pick<PenaltyKick, "side" | "seq">): string {
  return `${kick.side}|${kick.seq}`;
}

function pickBetterKick(a: PenaltyKick, b: PenaltyKick): PenaltyKick {
  const score = (kick: PenaltyKick) =>
    (kick.outcome !== "unknown" ? 4 : 0) + (kick.player ? 2 : 0);
  return score(b) > score(a) ? b : a;
}

export function mergeStoredPenaltyKicks(
  stored: PenaltyKick[],
  fresh: PenaltyKick[],
): PenaltyKick[] {
  const byKey = new Map<string, PenaltyKick>();
  for (const kick of stored) byKey.set(kickKey(kick), kick);
  for (const kick of fresh) {
    const key = kickKey(kick);
    const prev = byKey.get(key);
    byKey.set(key, prev ? pickBetterKick(prev, kick) : kick);
  }
  return [...byKey.values()].sort((a, b) => a.seq - b.seq);
}

export async function loadStoredPenaltyKicks(
  fixtureId: number,
): Promise<PenaltyKick[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("match_penalty_kicks")
      .select("side, seq, team_kick, player, player_short, outcome")
      .eq("fixture_id", fixtureId)
      .order("seq", { ascending: true });

    if (error) {
      if (error.message.includes("match_penalty_kicks")) return [];
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
      side: row.side as "home" | "away",
      seq: row.seq,
      teamKick: row.team_kick ?? 0,
      player: row.player,
      playerShort: row.player_short,
      outcome: row.outcome as PenaltyKick["outcome"],
    }));
  } catch {
    return [];
  }
}

export async function persistPenaltyKicks(
  fixtureId: number,
  kicks: PenaltyKick[],
): Promise<void> {
  if (kicks.length === 0) return;

  try {
    const existing = await loadStoredPenaltyKicks(fixtureId);
    const merged = mergeStoredPenaltyKicks(existing, kicks);
    const incomingKeys = new Set(kicks.map(kickKey));
    const toWrite = merged.filter((kick) => incomingKeys.has(kickKey(kick)));
    if (toWrite.length === 0) return;

    const supabase = getSupabaseAdminClient();
    const rows = toWrite.map((kick) => ({
      fixture_id: fixtureId,
      kick_key: kickKey(kick),
      side: kick.side,
      seq: kick.seq,
      team_kick: kick.teamKick,
      player: kick.player,
      player_short: kick.playerShort,
      outcome: kick.outcome,
    }));

    const { error } = await supabase
      .from("match_penalty_kicks")
      .upsert(rows, { onConflict: "fixture_id,kick_key" });

    if (error?.message.includes("match_penalty_kicks")) return;
    if (error) throw new Error(error.message);
  } catch {
    // Supabase optional — live feed still works without the accumulator table.
  }
}

/** Merge stored kicks with the latest TxLINE extract for board display. */
export async function resolvePenaltyShootoutForDisplay(
  fixtureId: number,
  fresh: PenaltyShootout | null,
): Promise<PenaltyShootout | null> {
  if (!fresh) return null;

  const stored = await loadStoredPenaltyKicks(fixtureId);
  if (stored.length === 0) return fresh;

  const mergedKicks = mergeStoredPenaltyKicks(stored, fresh.kicks);
  const merged = mergePenaltyShootout(fresh, {
    ...fresh,
    kicks: mergedKicks,
    homeScore: fresh.homeScore,
    awayScore: fresh.awayScore,
  });
  return merged ?? fresh;
}
