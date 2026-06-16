import assert from "node:assert/strict";
import {
  formatKickoffLocalLine,
  formatKickoffUtcLabel,
  formatNextMatchBadgeLocal,
  isKickoffLocalToday,
  kickoffDate,
} from "./formatKickoff";

const kickoff = kickoffDate({ date: "2026-06-11", time: "19:00" });
const notToday = new Date("2026-06-10T12:00:00Z");
const isToday = new Date("2026-06-11T12:00:00Z");

assert.equal(formatKickoffUtcLabel("19:00"), "19:00 UTC");

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

console.log("formatKickoff.test.ts: ok");
