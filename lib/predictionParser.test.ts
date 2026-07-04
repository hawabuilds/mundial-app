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

/** Resolve a WC 2026 fixture by canonical team names (see worldCup2026Fixtures.ts). */
function fixtureByTeams(home: string, away: string): Pick<Fixture, "home" | "away"> {
  const match = FIXTURES.find((f) => f.home === home && f.away === away);
  if (!match) {
    throw new Error(`No fixture for ${home} vs ${away}`);
  }
  return { home: match.home, away: match.away };
}

const MATCH = { home: "Saint-Étienne", away: "Nice" };
const TURKIYE_MATCH = fixtureByTeams("Australia", "Türkiye");
const BOSNIA_MATCH = fixtureByTeams("Canada", "Bosnia & Herzegovina");
const USA_MATCH = fixtureByTeams("USA", "Paraguay");
const KOREA_MATCH = fixtureByTeams("South Korea", "Czech Republic");
const NED_JPN_MATCH = fixtureByTeams("Netherlands", "Japan");
const CURACAO_MATCH = fixtureByTeams("Germany", "Curaçao");
const IVORY_MATCH = fixtureByTeams("Ivory Coast", "Ecuador");

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
    reply: "Türkiye 2-1 Australia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 1, awayScore: 2 },
  },
  {
    name: "valid: Turkiye ASCII u",
    reply: "Turkiye 1-0 Australia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 0, awayScore: 1 },
  },
  {
    name: "valid: Turkey alias",
    reply: "Turkey 3-2 Australia",
    fixture: TURKIYE_MATCH,
    expected: { homeScore: 2, awayScore: 3 },
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
    name: "reject: two scorelines in one reply",
    reply: "Saint-Étienne 2-1 Nice 3-0",
    fixture: MATCH,
    expected: null,
  },
  {
    name: "valid: Bosnia short names",
    reply: "Bosnia 1-0 Canada",
    fixture: BOSNIA_MATCH,
    expected: { homeScore: 0, awayScore: 1 },
  },
  {
    name: "valid: Bosnia reversed short names",
    reply: "Canada 0-1 Bosnia",
    fixture: BOSNIA_MATCH,
    expected: { homeScore: 0, awayScore: 1 },
  },
  {
    name: "valid: USMNT alias",
    reply: "USMNT 2-1 Paraguay",
    fixture: USA_MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: United States full name reversed",
    reply: "Paraguay 0-2 United States",
    fixture: USA_MATCH,
    expected: { homeScore: 2, awayScore: 0 },
  },
  {
    name: "valid: Korea Republic alias",
    reply: "Korea Republic 1-0 Czech Republic",
    fixture: KOREA_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: corrupted Curaçao in reply",
    reply: "Germany 2-0 Cura??ao",
    fixture: CURACAO_MATCH,
    expected: { homeScore: 2, awayScore: 0 },
  },
  {
    name: "valid: Holland alias en-dash score",
    reply: "Holland 2–1 Japan",
    fixture: NED_JPN_MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: colon score separator",
    reply: "Netherlands 2:1 Japan",
    fixture: NED_JPN_MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: space-separated score",
    reply: "Netherlands 2 1 Japan",
    fixture: NED_JPN_MATCH,
    expected: { homeScore: 2, awayScore: 1 },
  },
  {
    name: "valid: Côte d'Ivoire accent alias",
    reply: "Côte d'Ivoire 1-0 Ecuador",
    fixture: IVORY_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: Ivory Coast alias reversed",
    reply: "Ecuador 0-1 Ivory Coast",
    fixture: IVORY_MATCH,
    expected: { homeScore: 1, awayScore: 0 },
  },
  {
    name: "valid: KOR abbreviation",
    reply: "KOR 3-2 Czech Republic",
    fixture: KOREA_MATCH,
    expected: { homeScore: 3, awayScore: 2 },
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
