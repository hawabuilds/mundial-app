import { FIXTURES, type Fixture } from "../app/data/fixtures";
import {
  getTeamAliases,
  matchTeamsInOrder,
  parsePrediction,
  type ParsedPrediction,
} from "./predictionParser";

type TestCase = {
  name: string;
  reply: string;
  fixture: Pick<Fixture, "home" | "away">;
  expected: ParsedPrediction | null;
};

const MATCH = { home: "Saint-Étienne", away: "Nice" };
const BOSNIA_MATCH = FIXTURES.find((f) => f.id === 10)!;
const UCL_FINAL = FIXTURES.find((f) => f.id === 12)!;
const SCOTLAND_MATCH = FIXTURES.find((f) => f.id === 11)!;
const TURKIYE_MATCH = FIXTURES.find((f) => f.id === 19)!;

const CASES: TestCase[] = [
  {
    name: "valid: home score away with hyphen",
    reply: "Saint-Étienne 2-1 Nice",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: St Etienne alias",
    reply: "St Etienne 2-1 Nice",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: Türkiye with umlaut",
    reply: "Türkiye 2-1 North Macedonia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: Turkiye ASCII u",
    reply: "Turkiye 1-0 FYR Macedonia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: Turkey alias",
    reply: "Turkey 3-2 Macedonia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 3, awayScore: 2 },
  },
  {
    name: "valid: Saint-Etienne without accent",
    reply: "Saint-Etienne 1-1 OGC Nice",
    fixture: MATCH,
    expected: { homeScore: 1, awayScore: 1 },
  },
  {
    name: "valid: ASSE nickname",
    reply: "ASSE 3-0 Nice",
    fixture: MATCH,
    expected: { homeScore: 3, awayScore: 0 },
  },
  {
    name: "valid: reversed team order maps scores to teams",
    reply: "Nice 2-1 Saint-Étienne",
    fixture: MATCH,
    expected: { homeScore: 1, awayScore: 2 },
  },
  {
    name: "valid: score before teams",
    reply: "2-1 St Etienne Nice",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: split score around team names",
    reply: "Saint-Étienne 2 Nice 1",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: case insensitive",
    reply: "st etienne 2-0 nice",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 0 },
  },
  {
    name: "valid: extra words and punctuation",
    reply: "Going with St. Etienne, 2-1, Nice tonight!",
    fixture: MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: nil-nil",
    reply: "Saint-Étienne 0-0 Nice",
    fixture: MATCH,
    expected: { homeScore: 0, awayScore: 0 },
  },
  {
    name: "reject: bare score only",
    reply: "2-1",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "reject: missing away team",
    reply: "Saint-Étienne 2-1",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "reject: missing home team",
    reply: "2-1 Nice",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "reject: score out of range",
    reply: "Saint-Étienne 21-0 Nice",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "reject: written numbers not digits",
    reply: "Saint-Étienne one - nil Nice",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "valid: Bosnia short names",
    reply: "Bosnia 1-0 Macedonia",
    fixture: BOSNIA_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: Bosnia reversed short names",
    reply: "Macedonia 0-1 Bosnia",
    fixture: BOSNIA_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: UCL Arsenal 1-0 PSG abbreviations",
    reply: "Arsenal 1-0 PSG",
    fixture: UCL_FINAL,
    expected: { homeScore: 0, awayScore: 1 },
  },
  {
    name: "valid: UCL PSG hyphenated full name",
    reply: "Paris Saint-Germain 2-1 Arsenal",
    fixture: UCL_FINAL,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: UCL Gunners nickname",
    reply: "Gunners 1-1 PSG",
    fixture: UCL_FINAL,
    expected: { homeScore: 1, awayScore: 1 },
  },
  {
    name: "valid: Scotland corrupted Curaçao in reply",
    reply: "Scotland 2-0 Cura??ao",
    fixture: SCOTLAND_MATCH,
    expected: { homeScore: 2, awayScore: 0 },
  },
];

function samePrediction(
  actual: ParsedPrediction | null,
  expected: ParsedPrediction | null,
): boolean {
  if (actual === null && expected === null) return true;
  if (!actual || !expected) return false;
  return actual.homeScore === expected.homeScore && actual.awayScore === expected.awayScore;
}

function run(): void {
  let passed = 0;
  let failed = 0;

  console.log("predictionParser tests\n");

  for (const testCase of CASES) {
    const actual = parsePrediction(testCase.reply, testCase.fixture);
    const ok = samePrediction(actual, testCase.expected);

    if (ok) {
      passed += 1;
      console.log(`PASS  ${testCase.name}`);
    } else {
      failed += 1;
      console.log(`FAIL  ${testCase.name}`);
      console.log(`      reply:   ${JSON.stringify(testCase.reply)}`);
      console.log(`      fixture: ${testCase.fixture.home} vs ${testCase.fixture.away}`);
      console.log(`      expected: ${JSON.stringify(testCase.expected)}`);
      console.log(`      actual:   ${JSON.stringify(actual)}`);
    }
  }

  console.log("\nTeam matcher smoke checks");
  const bothTeams = matchTeamsInOrder("St Etienne 2-1 Nice", MATCH);
  const reversedTeams = matchTeamsInOrder("Nice 2-1 Saint-Etienne", MATCH);
  console.log(
    bothTeams ? "PASS  matchTeamsInOrder finds both teams" : "FAIL  matchTeamsInOrder finds both teams",
  );
  console.log(
    reversedTeams
      ? "PASS  matchTeamsInOrder finds reversed teams"
      : "FAIL  matchTeamsInOrder finds reversed teams",
  );
  if (!bothTeams) failed += 1;
  else passed += 1;
  if (!reversedTeams) failed += 1;
  else passed += 1;

  console.log("\nAlias coverage");
  console.log(
    `Saint-Étienne aliases include St Etienne: ${getTeamAliases("Saint-Étienne").includes("St Etienne")}`,
  );
  console.log(`Nice aliases include OGC Nice: ${getTeamAliases("Nice").includes("OGC Nice")}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
