import assert from "node:assert/strict";
import { getFixtureById } from "../app/data/fixtures";
import {
  tweetMatchesFixture,
  tweetMentionsTeam,
} from "./xMatchPosts";

const scotland = getFixtureById(11)!;
const turkiye = getFixtureById(19)!;

assert.ok(
  tweetMentionsTeam("Scotland vs Curacao — predict now", "Scotland"),
  "Scotland mention",
);
assert.ok(
  tweetMentionsTeam("Scotland vs Curacao — predict now", "Curaçao"),
  "Curacao without accent",
);
assert.ok(
  tweetMatchesFixture(
    "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland vs Curacao. Reply with your score!",
    scotland,
  ),
  "full fixture in tweet text",
);
assert.ok(
  tweetMatchesFixture(
    "Scotland vs Cura??ao\nReply below with your predicted score",
    scotland,
  ),
  "X API corrupted Curaçao spelling",
);

assert.ok(
  tweetMentionsTeam("🇹🇷 Türkiye vs North Macedonia — reply with your score", "Türkiye"),
  "Türkiye with umlaut in match post",
);
assert.ok(
  tweetMentionsTeam("Turkey vs Macedonia friendly", "Türkiye"),
  "Turkey alias in match post",
);
assert.ok(
  tweetMatchesFixture(
    "Türkiye 🇹🇷 vs North Macedonia\nFormat: Turkiye 2 - 1 North Macedonia",
    turkiye,
  ),
  "full Türkiye fixture tweet",
);

console.log("xMatchPosts.test.ts: ok");
