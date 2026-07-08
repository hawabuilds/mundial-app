import assert from "node:assert/strict";
import type { TxScoreEvent } from "./txodds";
import {
  extractPenaltyShootout,
  mergePenaltyShootout,
  parsePenaltyKickOutcome,
  penaltyRounds,
  penShootoutTallyFromStats,
} from "./penaltyShootout";

const SHOOTOUT_EVENTS: TxScoreEvent[] = [
  {
    FixtureId: 1,
    Seq: 100,
    StatusId: 10,
    Participant1IsHome: true,
    Stats: { "1": 1, "2": 1, "1001": 0, "1002": 1, "3001": 1, "3002": 0, "4001": 0, "4002": 0, "5001": 0, "5002": 0 },
  },
  {
    FixtureId: 1,
    Seq: 110,
    StatusId: 12,
    Action: "lineups",
    Participant1IsHome: true,
    Lineups: [
      { preferredName: "England", lineups: [] },
      {
        preferredName: "Switzerland",
        lineups: [
          { player: { normativeId: 1, preferredName: "Akanji, Manuel" } },
          { player: { normativeId: 2, preferredName: "Palmer, Cole" } },
        ],
      },
    ],
  },
  {
    FixtureId: 1,
    Seq: 111,
    StatusId: 12,
    Action: "penalty_outcome",
    Participant: 2,
    Participant1IsHome: true,
    Data: { Outcome: "Missed", PlayerId: 1 },
  },
  {
    FixtureId: 1,
    Seq: 112,
    StatusId: 12,
    Action: "penalty_outcome",
    Participant: 1,
    Participant1IsHome: true,
    Data: { Outcome: "Scored", PlayerId: 2 },
  },
  {
    FixtureId: 1,
    Seq: 113,
    StatusId: 12,
    Action: "penalty_outcome",
    Participant: 2,
    Participant1IsHome: true,
    Data: { Outcome: "Scored", PreferredName: "Xhaka, Granit" },
  },
];

console.log("penaltyShootout tests\n");

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${error instanceof Error ? error.message : error}`);
  }
}

run("parsePenaltyKickOutcome handles scored/missed/saved", () => {
  assert.equal(parsePenaltyKickOutcome("Scored"), "scored");
  assert.equal(parsePenaltyKickOutcome("missed"), "missed");
  assert.equal(parsePenaltyKickOutcome("Saved"), "saved");
});

run("extractPenaltyShootout builds kick list and tally", () => {
  const shootout = extractPenaltyShootout(SHOOTOUT_EVENTS, true, 12);
  assert.ok(shootout);
  assert.equal(shootout.homeScore, 1);
  assert.equal(shootout.awayScore, 1);
  assert.equal(shootout.kicks.length, 3);
  assert.equal(shootout.kicks[0]?.side, "away");
  assert.equal(shootout.kicks[0]?.outcome, "missed");
  assert.equal(shootout.kicks[1]?.side, "home");
  assert.equal(shootout.kicks[1]?.outcome, "scored");
  assert.equal(shootout.inProgress, true);
  assert.equal(shootout.aetHome, 1);
  assert.equal(shootout.aetAway, 1);
});

run("penaltyRounds groups home and away together per round", () => {
  const shootout = extractPenaltyShootout(SHOOTOUT_EVENTS, true, 12);
  assert.ok(shootout);
  const rounds = penaltyRounds(shootout);
  assert.equal(rounds.length, 2);
  assert.equal(rounds[0]?.away?.outcome, "missed");
  assert.equal(rounds[0]?.home?.outcome, "scored");
});

run("mergePenaltyShootout keeps missed outcomes across replay polls", () => {
  const first = extractPenaltyShootout(SHOOTOUT_EVENTS, true, 12);
  assert.ok(first);
  const replay = {
    ...first,
    kicks: first.kicks.map((kick) =>
      kick.outcome === "missed"
        ? { ...kick, outcome: "unknown" as const }
        : kick,
    ),
  };
  const merged = mergePenaltyShootout(first, replay);
  assert.ok(merged);
  assert.equal(
    merged.kicks.find((kick) => kick.seq === 111)?.outcome,
    "missed",
  );
});

run("penShootoutTallyFromStats reads TxLINE 6001/6002 stats", () => {
  const events: TxScoreEvent[] = [
    {
      FixtureId: 1,
      Seq: 10,
      StatusId: 13,
      Stats: { "6001": 4, "6002": 3, "1": 0, "2": 0 },
    },
  ];
  assert.deepEqual(penShootoutTallyFromStats(events, true), { home: 4, away: 3 });
});

run("extractPenaltyShootout collapses replayed penalty_outcome rows", () => {
  const events: TxScoreEvent[] = [
    {
      FixtureId: 1,
      Seq: 110,
      StatusId: 12,
      Action: "penalty_outcome",
      Participant: 2,
      Participant1IsHome: true,
      Data: { Outcome: "Scored" },
    },
    {
      FixtureId: 1,
      Seq: 111,
      StatusId: 12,
      Action: "penalty_outcome",
      Participant: 2,
      Participant1IsHome: true,
      Data: { Outcome: "Scored", PreferredName: "Quintero, J." },
    },
    {
      FixtureId: 1,
      Seq: 112,
      StatusId: 12,
      Action: "penalty_outcome",
      Participant: 1,
      Participant1IsHome: true,
      Data: { Outcome: "Missed" },
    },
    {
      FixtureId: 1,
      Seq: 113,
      StatusId: 13,
      Stats: { "6001": 0, "6002": 1 },
    },
  ];
  const shootout = extractPenaltyShootout(events, true, 13);
  assert.ok(shootout);
  assert.equal(shootout.kicks.length, 2);
  assert.equal(shootout.kicks[0]?.player, "J. Quintero");
  assert.equal(shootout.homeScore, 0);
  assert.equal(shootout.awayScore, 1);
});

run("extractPenaltyShootout uses stats tally when kicks are incomplete", () => {
  const events: TxScoreEvent[] = [
    {
      FixtureId: 1,
      Seq: 100,
      StatusId: 10,
      Stats: { "1": 0, "2": 0 },
    },
    {
      FixtureId: 1,
      Seq: 110,
      StatusId: 12,
      Action: "penalty_outcome",
      Participant: 1,
      Data: { Outcome: "Scored", PreferredName: "Vargas, Ruben" },
    },
    {
      FixtureId: 1,
      Seq: 111,
      StatusId: 13,
      Stats: { "6001": 4, "6002": 3 },
    },
  ];
  const shootout = extractPenaltyShootout(events, true, 13);
  assert.ok(shootout);
  assert.equal(shootout.homeScore, 4);
  assert.equal(shootout.awayScore, 3);
  assert.equal(shootout.kicks.length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
