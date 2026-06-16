import { readFileSync } from "fs";
import { getFixtureById } from "../app/data/fixtures.ts";
import { fetchReplies } from "../lib/fetchReplies.ts";
import { explainPrediction, parsePrediction } from "../lib/predictionParser.ts";

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

function rejectReason(text, fixture) {
  const exp = JSON.parse(explainPrediction(text, fixture));
  if (!exp.teams) {
    return "Missing one or both team names (need Saint-Étienne and Nice, or aliases)";
  }
  if (!exp.scores) {
    return "Both teams found but no valid numeric score (e.g. 2-1, 2 - 1, or St Etienne 2 Nice 1)";
  }
  return "Unknown";
}

loadEnv();

const fixture = getFixtureById(1);
if (!fixture?.tweetId) throw new Error("Fixture 1 missing tweetId — set tweetId after posting the match tweet");

const replies = await fetchReplies(fixture.tweetId);
const seenAuthors = new Set();
const accepted = [];
const rejected = [];
const skipped = [];

for (const reply of replies) {
  if (seenAuthors.has(reply.authorId)) {
    skipped.push(reply);
    continue;
  }

  const parsed = parsePrediction(reply.text, fixture);
  if (parsed) {
    seenAuthors.add(reply.authorId);
    accepted.push({ reply, parsed });
  } else {
    rejected.push({ reply, reason: rejectReason(reply.text, fixture) });
  }
}

console.log(`=== ACCEPTED (${accepted.length}) ===`);
for (const { reply, parsed } of accepted) {
  console.log(`@${reply.authorUsername}: ${JSON.stringify(reply.text)}`);
  console.log(`  -> home ${parsed.homeScore}, away ${parsed.awayScore}`);
}

console.log(`\n=== REJECTED (${rejected.length}) ===`);
for (const { reply, reason } of rejected) {
  console.log(`@${reply.authorUsername}: ${JSON.stringify(reply.text)}`);
  console.log(`  Why: ${reason}`);
}

console.log(`\n=== SKIPPED — later reply from same author (${skipped.length}) ===`);
for (const reply of skipped) {
  console.log(`@${reply.authorUsername}: ${JSON.stringify(reply.text)}`);
}
