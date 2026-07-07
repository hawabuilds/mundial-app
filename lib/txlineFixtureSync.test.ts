import assert from "node:assert/strict";
import type { Fixture } from "@/app/data/fixtures";
import {
  diffTxlineFixtures,
  knownTxFixtureIds,
  txFixtureToDraft,
  type TxlineRegistryRow,
} from "./txlineFixtureSync";
import type { TxFixture } from "./txodds";

const staticFixtures: Fixture[] = [
  {
    id: 1,
    home: "Mexico",
    away: "South Africa",
    date: "2026-06-11",
    time: "19:00",
    group: "FIFA World Cup",
    externalFixtureId: 1001,
  },
];

function txRow(overrides: Partial<TxFixture> = {}): TxFixture {
  return {
    Ts: 1,
    StartTime: Date.parse("2026-06-11T19:00:00.000Z"),
    Competition: "World Cup",
    CompetitionId: 1,
    FixtureGroupId: 1,
    Participant1Id: 1,
    Participant1: "Mexico",
    Participant2Id: 2,
    Participant2: "South Africa",
    FixtureId: 1001,
    Participant1IsHome: true,
    ...overrides,
  };
}

function registryRow(
  overrides: Partial<TxlineRegistryRow> = {},
): TxlineRegistryRow {
  return {
    matchId: 1,
    txFixtureId: 1001,
    homeTeam: "Mexico",
    awayTeam: "South Africa",
    kickoffAt: "2026-06-11T19:00:00.000Z",
    competition: "World Cup",
    predictionsCollectedAt: null,
    scoredAt: null,
    predictionCount: 0,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${error instanceof Error ? error.message : error}`);
  }
}

run("txFixtureToDraft maps World Cup snapshot row", () => {
  const draft = txFixtureToDraft(txRow());
  assert.equal(draft?.txFixtureId, 1001);
  assert.equal(draft?.home, "Mexico");
  assert.equal(draft?.away, "South Africa");
  assert.equal(draft?.kickoffAt, "2026-06-11T19:00:00.000Z");
});

run("txFixtureToDraft skips friendlies", () => {
  assert.equal(
    txFixtureToDraft(txRow({ Competition: "International Friendlies" })),
    null,
  );
});

run("knownTxFixtureIds unions static external ids and registry", () => {
  const known = knownTxFixtureIds(staticFixtures, [
    registryRow({ txFixtureId: 2002, matchId: 2002 }),
  ]);
  assert.deepEqual([...known].sort(), [1001, 2002]);
});

run("diffTxlineFixtures inserts new World Cup fixtures", () => {
  const diff = diffTxlineFixtures(
    [txRow({ FixtureId: 3003, Participant1: "Brazil", Participant2: "France" })],
    staticFixtures,
    [registryRow()],
  );
  assert.equal(diff.toInsert.length, 1);
  assert.equal(diff.toInsert[0]?.txFixtureId, 3003);
  assert.equal(diff.toUpdate.length, 0);
});

run("diffTxlineFixtures is idempotent for known fixtures", () => {
  const diff = diffTxlineFixtures([txRow()], staticFixtures, [registryRow()]);
  assert.equal(diff.toInsert.length, 0);
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.skipped.length, 0);
});

run("diffTxlineFixtures updates kickoff when registry is not protected", () => {
  const diff = diffTxlineFixtures(
    [txRow({ StartTime: Date.parse("2026-06-11T20:00:00.000Z") })],
    staticFixtures,
    [registryRow({ kickoffAt: "2026-06-11T19:00:00.000Z" })],
  );
  assert.equal(diff.toUpdate.length, 1);
  assert.deepEqual(diff.toUpdate[0]?.changes, ["kickoff_at"]);
  assert.equal(diff.skipped.length, 0);
});

run("diffTxlineFixtures refuses to overwrite collected fixtures", () => {
  const diff = diffTxlineFixtures(
    [txRow({ Participant2: "England" })],
    staticFixtures,
    [
      registryRow({
        predictionsCollectedAt: "2026-06-12T00:00:00.000Z",
        awayTeam: "South Africa",
      }),
    ],
  );
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.skipped.length, 1);
  assert.match(diff.skipped[0]?.reason ?? "", /collection\/scoring history/);
});

run("diffTxlineFixtures refuses to overwrite scored auto fixtures", () => {
  const diff = diffTxlineFixtures(
    [txRow({ FixtureId: 4004, Participant1: "USA", Participant2: "Canada" })],
    staticFixtures,
    [
      registryRow({
        matchId: 4004,
        txFixtureId: 4004,
        homeTeam: "USA",
        awayTeam: "Canada",
        scoredAt: "2026-06-12T00:00:00.000Z",
        kickoffAt: "2026-06-11T19:00:00.000Z",
      }),
    ],
  );
  const changed = txRow({
    FixtureId: 4004,
    StartTime: Date.parse("2026-06-11T21:00:00.000Z"),
    Participant1: "USA",
    Participant2: "Canada",
  });
  const diff2 = diffTxlineFixtures([changed], staticFixtures, [
    registryRow({
      matchId: 4004,
      txFixtureId: 4004,
      homeTeam: "USA",
      awayTeam: "Canada",
      scoredAt: "2026-06-12T00:00:00.000Z",
      kickoffAt: "2026-06-11T19:00:00.000Z",
    }),
  ]);
  assert.equal(diff.toInsert.length, 0);
  assert.equal(diff2.toUpdate.length, 0);
  assert.equal(diff2.skipped.length, 1);
  assert.match(diff2.skipped[0]?.reason ?? "", /settled/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
