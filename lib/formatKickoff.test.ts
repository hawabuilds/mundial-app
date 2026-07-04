import assert from "node:assert/strict";
import {
  formatKickoffLocalLine,
  formatKickoffUtcLabel,
  formatKickoffUtcLine,
  formatNextMatchBadgeLocal,
  isKickoffLocalToday,
  kickoffDate,
  normalizeStartTimeMs,
} from "./formatKickoff";

const kickoff = kickoffDate({ date: "2026-06-11", time: "19:00" });
const notToday = new Date("2026-06-10T12:00:00Z");
const isToday = new Date("2026-06-11T12:00:00Z");

assert.equal(formatKickoffUtcLabel("19:00"), "19:00 UTC");

assert.equal(
  formatKickoffUtcLine(kickoff),
  "Thu 11 Jun · 19:00 UTC",
);

assert.equal(normalizeStartTimeMs(1_781_194_800_000), 1_781_194_800_000);
assert.equal(normalizeStartTimeMs(1_781_194_800), 1_781_194_800_000);

assert.equal(
  formatKickoffLocalLine(kickoff, "en", "America/Los_Angeles"),
  "Thu 11 Jun · 12:00 PM PDT",
);

assert.equal(
  formatKickoffLocalLine(kickoff, "en", "America/New_York"),
  "Thu 11 Jun · 3:00 PM EDT",
);

assert.equal(
  formatKickoffLocalLine(kickoff, "en", "Europe/London"),
  "Thu 11 Jun · 8:00 PM BST",
);

assert.equal(
  formatKickoffLocalLine(kickoff, "en", "Asia/Tokyo"),
  "Fri 12 Jun · 4:00 AM JST",
);

assert.doesNotMatch(
  formatKickoffLocalLine(kickoff, "en", "America/Los_Angeles"),
  /GMT[+-]/,
);

assert.equal(isKickoffLocalToday(kickoff, "UTC", isToday), true);
assert.equal(isKickoffLocalToday(kickoff, "UTC", notToday), false);

assert.equal(
  formatNextMatchBadgeLocal(kickoff, "en", "UTC", "Today", notToday),
  "11 Jun",
);

assert.equal(
  formatNextMatchBadgeLocal(kickoff, "en", "UTC", "Today", isToday),
  "Today",
);

assert.equal(
  kickoffDate({
    date: "2026-06-11",
    time: "00:00",
    kickoffUtcMs: Date.parse("2026-06-11T19:00:00Z"),
  }).toISOString(),
  "2026-06-11T19:00:00.000Z",
);

console.log("formatKickoff.test.ts: ok");
