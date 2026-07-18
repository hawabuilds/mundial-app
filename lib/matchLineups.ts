import {
  formatPlayerFullName,
  formatPlayerShortName,
} from "@/lib/playerDisplayName";
import {
  fetchScoresSnapshot,
  fetchScoreSequence,
  isTxoddsConfigured,
  type TxScoreEvent,
} from "@/lib/txodds";

export type LineupPlayer = {
  playerId: number;
  name: string;
  shortName: string;
  side: "home" | "away";
};

function mergeLineupEvents(events: TxScoreEvent[]): TxScoreEvent[] {
  const bySeq = new Map<number, TxScoreEvent>();
  for (const event of events) {
    const seq = event.Seq ?? -1;
    const prev = bySeq.get(seq);
    if (
      !prev ||
      (event.Lineups?.length ?? 0) > (prev.Lineups?.length ?? 0)
    ) {
      bySeq.set(seq, event);
    }
  }
  return [...bySeq.values()].sort((a, b) => (a.Seq ?? 0) - (b.Seq ?? 0));
}

export function extractLineupPlayersFromEvents(
  events: TxScoreEvent[],
  homeIsP1: boolean,
): LineupPlayer[] {
  const merged = mergeLineupEvents(events);
  const lineupEvents = merged.filter(
    (event) => event.Action === "lineups" && (event.Lineups?.length ?? 0) > 0,
  );
  const latest = lineupEvents.at(-1);
  if (!latest?.Lineups) return [];

  const players: LineupPlayer[] = [];
  latest.Lineups.forEach((team, teamIndex) => {
    const participant: 1 | 2 = teamIndex === 0 ? 1 : 2;
    const side: "home" | "away" =
      participant === 1
        ? homeIsP1
          ? "home"
          : "away"
        : homeIsP1
          ? "away"
          : "home";

    for (const entry of team.lineups ?? []) {
      const id = entry.player?.normativeId;
      const preferred = entry.player?.preferredName?.trim();
      if (id == null || !preferred) continue;
      const name = formatPlayerFullName(preferred);
      if (!name) continue;
      players.push({
        playerId: id,
        name,
        shortName: formatPlayerShortName(preferred) ?? name,
        side,
      });
    }
  });

  const byId = new Map<number, LineupPlayer>();
  for (const player of players) {
    byId.set(player.playerId, player);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchMatchLineupPlayers(input: {
  txFixtureId: number;
  homeIsP1?: boolean;
}): Promise<LineupPlayer[]> {
  if (!isTxoddsConfigured()) return [];

  const homeIsP1 = input.homeIsP1 ?? true;
  const historical = await fetchScoreSequence(input.txFixtureId).catch(() => []);
  const snapshot = await fetchScoresSnapshot(input.txFixtureId).catch(() => []);
  const events = mergeLineupEvents([...historical, ...snapshot]);
  return extractLineupPlayersFromEvents(events, homeIsP1);
}
