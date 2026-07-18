import { matchGoalsFromEvents } from "../lib/matchGoalsPersist";
import { deriveFirstGoalscorer } from "../lib/firstGoalscorer";
import type { TxScoreEvent } from "../lib/txodds";

/** Simulates a fresh live match poll — play-by-play capture at persist time. */
const liveCapture: TxScoreEvent[] = [
  {
    FixtureId: 999001,
    Action: "lineups",
    Seq: 1,
    Participant1IsHome: true,
    Lineups: [
      {
        preferredName: "Team A",
        lineups: [{ player: { normativeId: 501, preferredName: "Smith, John" } }],
      },
      {
        preferredName: "Team B",
        lineups: [{ player: { normativeId: 502, preferredName: "Jones, Amy" } }],
      },
    ],
  },
  {
    FixtureId: 999001,
    Action: "goal",
    Seq: 42,
    Participant: 2,
    Participant1IsHome: true,
    Clock: { Seconds: 19 * 60 + 22 },
    Data: { PlayerId: 502 },
  },
  {
    FixtureId: 999001,
    Action: "goal",
    Seq: 88,
    Participant: 1,
    Participant1IsHome: true,
    Clock: { Seconds: 44 * 60 + 5 },
    Data: { PlayerId: 501, PreferredName: "Smith, John" },
  },
];

const captured = matchGoalsFromEvents(liveCapture, true, "persist");
const first = deriveFirstGoalscorer(captured);

function goalKey(side: string, clockSeconds: number | null, minute: number | null, ownGoal: boolean): string {
  if (clockSeconds != null) return `${side}|s${clockSeconds}|${ownGoal ? 1 : 0}`;
  return `${side}|${minute ?? "?"}|${ownGoal ? 1 : 0}`;
}

console.log(
  JSON.stringify(
    {
      scenario: "fresh live match — name from lineup when only PlayerId on first goal",
      captured,
      firstGoalscorer: first,
      persistRows: captured.map((g) => ({
        goal_key: goalKey(g.side, g.clockSeconds, g.minute, g.ownGoal),
        player_id: g.playerId,
        clock_seconds: g.clockSeconds,
        seq: g.seq,
        player: g.player,
        minute: g.minute,
        side: g.side,
      })),
    },
    null,
    2,
  ),
);
