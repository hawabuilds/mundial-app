import { terminalScoreEventSeq, type TxScoreEvent } from "./txodds";

export type ProofSeqSource = "game_finalised" | "terminal_fallback";

export type GameFinalisedDiscoverySource = "snapshot" | "historical";

export function gameFinalisedEventSeq(events: TxScoreEvent[]): number | null {
  const finalised = events.filter((event) => event.Action === "game_finalised");
  if (finalised.length === 0) return null;
  const latest = finalised.reduce((best, event) =>
    (event.Seq ?? -1) >= (best.Seq ?? -1) ? event : best,
  );
  return latest.Seq ?? null;
}

/** Prefer snapshot, then historical — logs which feed had the finalised row. */
export function discoverGameFinalisedSeq(
  snapshot: TxScoreEvent[],
  historical: TxScoreEvent[] = [],
): { seq: number; foundIn: GameFinalisedDiscoverySource } | null {
  const fromSnapshot = gameFinalisedEventSeq(snapshot);
  if (fromSnapshot != null) {
    return { seq: fromSnapshot, foundIn: "snapshot" };
  }
  const fromHistorical = gameFinalisedEventSeq(historical);
  if (fromHistorical != null) {
    return { seq: fromHistorical, foundIn: "historical" };
  }
  return null;
}

export type ResolvedProofEventSeq = {
  seq: number | null;
  source: ProofSeqSource | null;
  gameFinalisedFound: boolean;
  gameFinalisedIn: GameFinalisedDiscoverySource | null;
};

/** TxODDS-supported seq: prefer Action=game_finalised (snapshot then historical), else terminal StatusId. */
export function resolveProofEventSeq(events: TxScoreEvent[]): ResolvedProofEventSeq {
  return resolveProofEventSeqFromSources(events, []);
}

export function resolveProofEventSeqFromSources(
  snapshot: TxScoreEvent[],
  historical: TxScoreEvent[] = [],
): ResolvedProofEventSeq {
  const discovered = discoverGameFinalisedSeq(snapshot, historical);
  if (discovered) {
    return {
      seq: discovered.seq,
      source: "game_finalised",
      gameFinalisedFound: true,
      gameFinalisedIn: discovered.foundIn,
    };
  }

  const fallbackSeq =
    terminalScoreEventSeq(snapshot) ?? terminalScoreEventSeq(historical);
  if (fallbackSeq != null) {
    return {
      seq: fallbackSeq,
      source: "terminal_fallback",
      gameFinalisedFound: false,
      gameFinalisedIn: null,
    };
  }

  return {
    seq: null,
    source: null,
    gameFinalisedFound: false,
    gameFinalisedIn: null,
  };
}
