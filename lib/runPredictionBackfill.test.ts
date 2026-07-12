import assert from "node:assert/strict";
import { isXOutageError } from "./runPredictionBackfill";

assert.equal(
  isXOutageError(new Error("Service Unavailable")),
  true,
  "503 text is outage",
);
assert.equal(
  isXOutageError(new Error("X API error (503)")),
  true,
  "status 503 is outage",
);
assert.equal(
  isXOutageError(new Error("No match post found")),
  false,
  "non-outage errors stay hard errors",
);

console.log("runPredictionBackfill.test.ts: ok");
