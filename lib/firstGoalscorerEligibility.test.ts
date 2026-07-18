import assert from "node:assert/strict";
import type { Fixture } from "@/app/data/fixtures";
import { buildEligiblePreKickoffPredictions } from "./predictionEligibility";
import type { FetchedReply } from "./fetchReplies";

console.log("firstGoalscorerEligibility tests\n");

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

const fixture: Fixture = {
  id: 18257865,
  home: "France",
  away: "England",
  date: "2026-07-18",
  time: "21:00",
  group: "World Cup",
  externalFixtureId: 18257865,
};

const kickoffMs = Date.parse("2026-07-18T21:00:00.000Z");

run("pre-kickoff X reply makes user eligible before collection", () => {
  const replies: FetchedReply[] = [
    {
      id: "1",
      authorId: "999001",
      authorUsername: "testuser",
      text: "France 2-1 England",
      createdAt: "2026-07-18T18:00:00.000Z",
    },
  ];

  const eligible = buildEligiblePreKickoffPredictions(replies, fixture, kickoffMs);
  const hit = eligible.get("999001");
  assert.ok(hit);
  assert.equal(hit.homeScore, 2);
  assert.equal(hit.awayScore, 1);
});

run("post-kickoff X reply is ignored for first-goalscorer eligibility", () => {
  const replies: FetchedReply[] = [
    {
      id: "2",
      authorId: "999002",
      authorUsername: "lateuser",
      text: "France 1-0 England",
      createdAt: "2026-07-18T21:05:00.000Z",
    },
  ];

  const eligible = buildEligiblePreKickoffPredictions(replies, fixture, kickoffMs);
  assert.equal(eligible.has("999002"), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
