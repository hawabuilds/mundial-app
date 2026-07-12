import assert from "node:assert/strict";
import { isPinnedBoardKickoffWindow } from "./boardDisplayPolicy";
import {
  pinnedFixtureIds,
  pinnedTxFixtureIdsFromSnapshot,
  pinnedTxFixtureIdsInBoardWindow,
} from "./pinnedBoardFixtures";
import type { TxFixture } from "./txodds";

const now = Date.parse("2026-07-12T00:30:00.000Z");
const englandNorwayKickoff = Date.parse("2026-07-11T21:00:00.000Z");
const argentinaKickoff = Date.parse("2026-07-12T01:00:00.000Z");

const qfEnglandNorway: TxFixture = {
  Ts: 0,
  StartTime: englandNorwayKickoff,
  Competition: "FIFA World Cup",
  CompetitionId: 0,
  FixtureGroupId: 9001,
  Participant1Id: 0,
  Participant1: "England",
  Participant2Id: 0,
  Participant2: "Norway",
  FixtureId: 19990001,
  Participant1IsHome: true,
  GameState: 5,
};

const qfArgentina: TxFixture = {
  ...qfEnglandNorway,
  StartTime: argentinaKickoff,
  Participant1: "Argentina",
  Participant2: "Switzerland",
  FixtureId: 19990002,
  GameState: 1,
};

assert.equal(
  isPinnedBoardKickoffWindow(englandNorwayKickoff, now),
  true,
  "recent FT kickoff stays in pin window",
);

const fromSnapshot = pinnedTxFixtureIdsFromSnapshot(
  [qfEnglandNorway, qfArgentina],
  now,
);
assert.ok(
  fromSnapshot.includes(19990001),
  "board-only QF from TxLINE snapshot is pinned",
);
assert.ok(
  fromSnapshot.includes(19990002),
  "upcoming QF in lookahead window is pinned",
);

const pinned = pinnedFixtureIds(now, [qfEnglandNorway, qfArgentina]);
assert.ok(
  pinned.has(19990001),
  "pinnedFixtureIds includes snapshot QF",
);

const registryOnly = pinnedTxFixtureIdsInBoardWindow(
  Date.parse("2026-07-07T23:41:00.000Z"),
);
assert.ok(registryOnly.length > 0, "registry matches still pinned");

console.log("pinnedBoardFixtures.test.ts: ok");
