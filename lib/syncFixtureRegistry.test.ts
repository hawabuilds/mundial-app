import assert from "node:assert/strict";
import { FIXTURES, fixtureCacheKey } from "../app/data/fixtures";

const ids = FIXTURES.map((f) => f.id);
const keys = FIXTURES.map((f) => fixtureCacheKey(f));

assert.equal(new Set(ids).size, ids.length, "fixture ids must be unique");
assert.equal(new Set(keys).size, keys.length, "fixture cache keys must be unique");
assert.ok(FIXTURES.length === 2, "expected today test slate (2 friendlies)");
assert.ok(
  FIXTURES.every((f) => f.id > 5),
  "must not reuse match ids 1–5 (prior days in Supabase)",
);
const may30 = FIXTURES.filter((f) => f.date === "2026-05-30");
assert.deepEqual(
  may30.map((f) => f.id).sort(),
  [11, 12],
);
assert.equal(may30.find((f) => f.id === 12)?.home, "Paris Saint Germain");
assert.equal(may30.find((f) => f.id === 12)?.away, "Arsenal");
assert.equal(may30.find((f) => f.id === 12)?.result?.homeScore, 1);
assert.equal(may30.find((f) => f.id === 12)?.result?.awayScore, 1);

const may31 = FIXTURES.filter((f) => f.date === "2026-05-31");
assert.deepEqual(
  may31.map((f) => f.id).sort(),
  [13, 14, 15, 16],
);
assert.equal(may31.find((f) => f.id === 13)?.home, "Poland");
assert.equal(may31.find((f) => f.id === 16)?.away, "Panama");

const jun01 = FIXTURES.filter((f) => f.date === "2026-06-01");
assert.deepEqual(
  jun01.map((f) => f.id).sort(),
  [17, 18, 19],
);
assert.equal(jun01.find((f) => f.id === 19)?.home, "Türkiye");

console.log("syncFixtureRegistry.test.ts: ok");
