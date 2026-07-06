import assert from "node:assert/strict";
import {
  classifyScoreProofHttpFailure,
  lastLiveClockSeconds,
  latestLiveScoreEvent,
  latestTerminalStatusId,
  normalizeScoreProofPayload,
  parseScoreProofResponse,
  scoresFeedShowsTerminalFinish,
  secondHalfHasStarted,
  terminalScoreEventSeq,
  type TxScoreEvent,
} from "./txodds";

const ROOT_BYTES = Array.from({ length: 32 }, (_, index) => index + 1);
const NODE_BYTES = Array.from({ length: 32 }, (_, index) => 200 + index);

const MOCK_V2_BASE64 = JSON.stringify({
  ts: 1_700_000_000_000,
  statsToProve: [
    { key: 1, value: 2, period: 100 },
    { key: 2, value: 1, period: 100 },
  ],
  eventStatRoot: Buffer.from(ROOT_BYTES).toString("base64"),
  summary: {
    fixtureId: 18175918,
    updateStats: {
      updateCount: 42,
      minTimestamp: 1_700_000_000_000,
      maxTimestamp: 1_700_000_500_000,
    },
    eventStatsSubTreeRoot: Buffer.from(ROOT_BYTES).toString("base64"),
  },
  statProofs: [[{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: false }]],
  subTreeProof: [{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: false }],
  mainTreeProof: [{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: true }],
});

const MOCK_V2_BYTE_ARRAY = JSON.stringify({
  ts: 1_700_000_000_000,
  statsToProve: [
    { key: 1, value: 3, period: 100 },
    { key: 2, value: 2, period: 100 },
  ],
  eventStatRoot: ROOT_BYTES,
  summary: {
    fixtureId: 18175918,
    updateStats: {
      updateCount: 2,
      minTimestamp: 1_700_000_000_000,
      maxTimestamp: 1_700_000_500_000,
    },
    eventStatsSubTreeRoot: ROOT_BYTES,
  },
  statProofs: [[{ hash: NODE_BYTES, isRightSibling: true }]],
  subTreeProof: [{ hash: NODE_BYTES, isRightSibling: false }],
  mainTreeProof: [{ hash: NODE_BYTES, isRightSibling: true }],
});

console.log("txodds score proof tests\n");

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

run("parseScoreProofResponse accepts V2 base64 payload", () => {
  const result = parseScoreProofResponse(200, MOCK_V2_BASE64, {
    seq: 941,
    statKeys: [1, 2],
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.proofMode, "total");
  assert.equal(typeof result.proof.eventStatRoot, "string");
});

run("parseScoreProofResponse accepts V2 byte-array payload (devnet)", () => {
  const result = parseScoreProofResponse(200, MOCK_V2_BYTE_ARRAY, {
    seq: 1242,
    statKeys: [1, 2],
  });
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.proof.ts, 1_700_000_000_000);
  assert.ok(result.proof.eventStatRoot.length > 0);
});

run("normalizeScoreProofPayload converts byte arrays to base64", () => {
  const normalized = normalizeScoreProofPayload(JSON.parse(MOCK_V2_BYTE_ARRAY));
  assert.ok(normalized);
  assert.equal(typeof normalized!.eventStatRoot, "string");
  assert.equal(typeof normalized!.summary.eventStatsSubTreeRoot, "string");
});

run("parseScoreProofResponse legacy payload with statToProve", () => {
  const body = JSON.stringify({
    ts: 99,
    statToProve: { key: 1, value: 1, period: 0 },
    eventStatRoot: Buffer.from(ROOT_BYTES).toString("base64"),
    summary: {
      fixtureId: 1,
      updateStats: { updateCount: 1, minTimestamp: 1, maxTimestamp: 2 },
      eventStatsSubTreeRoot: Buffer.from(ROOT_BYTES).toString("base64"),
    },
    statProof: [{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: false }],
    subTreeProof: [{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: false }],
    mainTreeProof: [{ hash: Buffer.from(NODE_BYTES).toString("base64"), isRightSibling: false }],
  });
  const result = parseScoreProofResponse(200, body, { seq: 1, statKeys: [1] });
  assert.equal(result.status, "ok");
});

run("parseScoreProofResponse treats missing fields as not_yet_available", () => {
  const result = parseScoreProofResponse(200, JSON.stringify({ ts: 1 }), {
    seq: 1,
    statKeys: [1, 2],
  });
  assert.equal(result.status, "not_yet_available");
});

run("parseScoreProofResponse treats short binary arrays as not_yet_available", () => {
  const result = parseScoreProofResponse(
    200,
    JSON.stringify({
      ts: 1,
      eventStatRoot: [1, 2],
      summary: {
        fixtureId: 1,
        updateStats: { updateCount: 1, minTimestamp: 1, maxTimestamp: 2 },
        eventStatsSubTreeRoot: [1, 2],
      },
      statsToProve: [],
      statProofs: [],
      subTreeProof: [],
      mainTreeProof: [],
    }),
    { seq: 1, statKeys: [1, 2] },
  );
  assert.equal(result.status, "not_yet_available");
});

run("parseScoreProofResponse treats 404 as not_yet_available", () => {
  const result = parseScoreProofResponse(404, "proof not found", {
    seq: 1,
    statKeys: [1, 2],
  });
  assert.equal(result.status, "not_yet_available");
});

run("classifyScoreProofHttpFailure maps auth errors to error", () => {
  assert.equal(classifyScoreProofHttpFailure(403, "Access denied"), "error");
});

run("terminalScoreEventSeq picks latest FT event", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 10, StatusId: 4 },
    { FixtureId: 1, Seq: 20, StatusId: 5 },
    { FixtureId: 1, Seq: 15, StatusId: 5 },
  ];
  assert.equal(terminalScoreEventSeq(events), 20);
});

run("terminalScoreEventSeq returns null before full time", () => {
  const events: TxScoreEvent[] = [{ FixtureId: 1, Seq: 3, StatusId: 2 }];
  assert.equal(terminalScoreEventSeq(events), null);
});

run("latestLiveScoreEvent ignores hydration-break reconnect noise", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 100, StatusId: 2, Clock: { Seconds: 2700 }, Stats: { "1": 1, "2": 0 } },
    { FixtureId: 1, Seq: 200, StatusId: 4, Clock: { Seconds: 2800 }, Stats: { "1": 2, "2": 1 } },
    { FixtureId: 1, Seq: 999, StatusId: 100, Action: "game_finalised", Stats: { "1": 2, "2": 1 } },
    { FixtureId: 1, Seq: 1000, StatusId: 100, Action: "disconnected", Stats: { "1": 2, "2": 1 } },
  ];
  const latest = latestLiveScoreEvent(events);
  assert.equal(latest?.Seq, 200);
  assert.equal(latest?.StatusId, 4);
});

run("lastLiveClockSeconds freezes on last 1H clock at HT", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 10, StatusId: 2, Clock: { Seconds: 2760 } },
    { FixtureId: 1, Seq: 20, StatusId: 3 },
    { FixtureId: 1, Seq: 30, StatusId: 4, Clock: { Seconds: 9999 } },
  ];
  assert.equal(lastLiveClockSeconds(events, 3), 2760);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

run("secondHalfHasStarted detects 2H after halftime_finalised", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 473, StatusId: 3, Action: "halftime_finalised" },
    { FixtureId: 1, Seq: 682, StatusId: 4, Clock: { Seconds: 2800 } },
  ];
  assert.equal(secondHalfHasStarted(events), true);
});

run("scoresFeedShowsTerminalFinish on game_finalised", () => {
  const events: TxScoreEvent[] = [
    { FixtureId: 1, Seq: 900, StatusId: 100, Action: "game_finalised" },
  ];
  assert.equal(scoresFeedShowsTerminalFinish(events), true);
  assert.equal(latestTerminalStatusId(events), 100);
});

