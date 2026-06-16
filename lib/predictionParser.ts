import type { Fixture } from "../app/data/fixtures";

export type ParsedPrediction = {
  homeScore: number;
  awayScore: number;
};

type TeamMatch = {
  index: number;
  length: number;
};

type TeamSide = "home" | "away";

type FoundTeams = {
  homeMatch: TeamMatch;
  awayMatch: TeamMatch;
};

const TEAM_ALIASES: Record<string, readonly string[]> = {
  "Saint-Étienne": [
    "Saint-Étienne",
    "Saint-Etienne",
    "Saint Etienne",
    "St Etienne",
    "St. Etienne",
    "St-Etienne",
    "ASSE",
    "Les Verts",
  ],
  Nice: ["Nice", "OGC Nice", "Les Aiglons", "Aiglons"],
  "Bosnia & Herzegovina": ["Bosnia", "BIH", "Bosnia Herzegovina"],
  "FYR Macedonia": ["Macedonia", "North Macedonia", "MK"],
  "North Macedonia": ["FYR Macedonia", "Macedonia", "MK", "North Macedonia"],
  Türkiye: ["Türkiye", "Turkiye", "Turkey", "TUR"],
  Slovakia: ["Slovakia", "SVK"],
  Malta: ["Malta", "MLT"],
  Norway: ["Norway", "NOR"],
  Sweden: ["Sweden", "SWE"],
  "South Africa": ["RSA", "Bafana Bafana"],
  "Curaçao": ["Curacao", "Curaçao", "Cura??ao"],
  Scotland: ["Scotland", "SCO"],
  "Paris Saint Germain": [
    "PSG",
    "Paris SG",
    "Paris Saint-Germain",
    "Paris St Germain",
    "Paris St. Germain",
  ],
  Arsenal: ["Gunners"],
  USA: ["United States", "U.S.", "US", "USMNT"],
  Senegal: ["Lions of Teranga"],
  "South Korea": ["Korea Republic", "Korea Rep", "KOR", "South Korea"],
  "Ivory Coast": ["Côte d'Ivoire", "Cote d'Ivoire", "CIV"],
  "Congo DR": ["DR Congo", "DRC", "Democratic Republic of Congo"],
  "Cape Verde Islands": ["Cape Verde", "CPV"],
  "Czech Republic": ["Czechia", "CZE"],
  Netherlands: ["Holland", "NED", "Netherlands"],
  France: ["France", "FRA"],
  "Northern Ireland": ["Northern Ireland", "NIR", "NI"],
  Uzbekistan: ["Uzbekistan", "UZB"],
};

const SCORE_PATTERN = /(\d{1,2})\s*(?:[-:–—]|(?:\s+))\s*(\d{1,2})/;
const MAX_SCORE = 20;

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Aliases for a canonical fixture team name, longest first. */
export function getTeamAliases(teamName: string): string[] {
  const aliases = TEAM_ALIASES[teamName];
  if (!aliases) {
    return [teamName];
  }
  return [...new Set([teamName, ...aliases])].sort((a, b) => b.length - a.length);
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Case- and accent-insensitive text for team alias matching. */
export function normalizeForTeamMatch(text: string): string {
  return stripAccents(text.toLowerCase());
}

/** X sometimes returns Curaçao as Cura??ao — match replies and match posts anyway. */
export function textMentionsCuracaoVariant(text: string): boolean {
  const lower = normalizeForTeamMatch(text);
  return /cura(?:\?{1,2}|ç|c)?ao/.test(lower);
}

/** X may show Türkiye, Turkiye, or Turkey — all count as the same nation. */
export function textMentionsTurkiyeVariant(text: string): boolean {
  const lower = normalizeForTeamMatch(text);
  return /(?:^|[^a-z0-9])(?:turkiye|turkey)(?:[^a-z0-9]|$)/.test(lower);
}

function isTurkiyeTeam(team: string): boolean {
  return normalizeForTeamMatch(team) === "turkiye";
}

function findTurkiyeTeamMatch(text: string): TeamMatch | null {
  if (!textMentionsTurkiyeVariant(text)) return null;
  const lower = normalizeForTeamMatch(text);
  const re = /(?:^|[^a-z0-9])(turkiye|turkey)(?:[^a-z0-9]|$)/;
  const m = re.exec(lower);
  if (!m || m.index === undefined) return null;
  const index = m.index + (m[0].length - m[1]!.length);
  return { index, length: m[1]!.length };
}

function findEarliestTeamMatch(
  text: string,
  aliases: string[],
  canonicalTeam?: string,
): TeamMatch | null {
  if (canonicalTeam && isTurkiyeTeam(canonicalTeam)) {
    const turkiye = findTurkiyeTeamMatch(text);
    if (turkiye) return turkiye;
  }

  const lower = normalizeForTeamMatch(text);
  let best: TeamMatch | null = null;

  for (const alias of aliases) {
    const aliasLower = normalizeForTeamMatch(alias);
    let from = 0;

    while (from < lower.length) {
      const index = lower.indexOf(aliasLower, from);
      if (index === -1) break;

      const candidate = { index, length: alias.length };
      if (
        !best ||
        candidate.index < best.index ||
        (candidate.index === best.index && candidate.length > best.length)
      ) {
        best = candidate;
      }

      from = index + 1;
    }
  }

  return best;
}

function findBothTeams(
  text: string,
  fixture: Pick<Fixture, "home" | "away">,
): FoundTeams | null {
  const homeMatch = findEarliestTeamMatch(
    text,
    getTeamAliases(fixture.home),
    fixture.home,
  );
  const awayMatch = findEarliestTeamMatch(
    text,
    getTeamAliases(fixture.away),
    fixture.away,
  );
  if (!homeMatch || !awayMatch) return null;
  return { homeMatch, awayMatch };
}

function teamEnd(match: TeamMatch): number {
  return match.index + match.length;
}

function teamSide(
  match: TeamMatch,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): TeamSide {
  return match.index === homeMatch.index ? "home" : "away";
}

function teamsInTextOrder(
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): [TeamSide, TeamSide] {
  return homeMatch.index <= awayMatch.index ? ["home", "away"] : ["away", "home"];
}

function closestTeamBefore(
  scoreStart: number,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): TeamSide | null {
  const candidates: { side: TeamSide; end: number }[] = [];
  const homeEnd = teamEnd(homeMatch);
  const awayEnd = teamEnd(awayMatch);

  if (homeEnd <= scoreStart) candidates.push({ side: "home", end: homeEnd });
  if (awayEnd <= scoreStart) candidates.push({ side: "away", end: awayEnd });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.end - a.end);
  return candidates[0]!.side;
}

function closestTeamAfter(
  scoreEnd: number,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): TeamSide | null {
  const candidates: { side: TeamSide; start: number }[] = [];

  if (homeMatch.index >= scoreEnd) candidates.push({ side: "home", start: homeMatch.index });
  if (awayMatch.index >= scoreEnd) candidates.push({ side: "away", start: awayMatch.index });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.start - b.start);
  return candidates[0]!.side;
}

/** True when both fixture teams appear in the reply (any order). */
export function matchTeamsInOrder(
  replyText: string,
  fixture: Pick<Fixture, "home" | "away">,
): boolean {
  const text = normalizeText(replyText);
  return findBothTeams(text, fixture) !== null;
}

function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= MAX_SCORE;
}

function parseSingleScoreToken(fragment: string): number | null {
  const match = fragment.trim().match(/^(\d{1,2})(?:\D|$)/);
  if (!match) return null;

  const score = Number.parseInt(match[1]!, 10);
  if (!isValidScore(score)) return null;
  return score;
}

function assignScoresToSides(
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
  assignments: Partial<Record<TeamSide, number>>,
): ParsedPrediction | null {
  const homeScore = assignments.home;
  const awayScore = assignments.away;
  if (homeScore === undefined || awayScore === undefined) return null;
  if (!isValidScore(homeScore) || !isValidScore(awayScore)) return null;
  return { homeScore, awayScore };
}

function assignPairedScores(
  firstNumber: number,
  secondNumber: number,
  scoreStart: number,
  scoreEnd: number,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): ParsedPrediction | null {
  const teamBefore = closestTeamBefore(scoreStart, homeMatch, awayMatch);
  const teamAfter = closestTeamAfter(scoreEnd, homeMatch, awayMatch);
  const assignments: Partial<Record<TeamSide, number>> = {};

  if (teamBefore && teamAfter) {
    assignments[teamBefore] = firstNumber;
    assignments[teamAfter] = secondNumber;
    return assignScoresToSides(homeMatch, awayMatch, assignments);
  }

  if (!teamBefore && teamAfter) {
    const teamsAfter = [homeMatch, awayMatch]
      .filter((match) => match.index >= scoreEnd)
      .sort((a, b) => a.index - b.index);
    if (teamsAfter.length < 2) return null;

    assignments[teamSide(teamsAfter[0]!, homeMatch, awayMatch)] = firstNumber;
    assignments[teamSide(teamsAfter[1]!, homeMatch, awayMatch)] = secondNumber;
    return assignScoresToSides(homeMatch, awayMatch, assignments);
  }

  if (teamBefore && !teamAfter) {
    const [firstSide, secondSide] = teamsInTextOrder(homeMatch, awayMatch);
    assignments[firstSide] = firstNumber;
    assignments[secondSide] = secondNumber;
    return assignScoresToSides(homeMatch, awayMatch, assignments);
  }

  return null;
}

function parsePairedScoreAdjacent(
  text: string,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): ParsedPrediction | null {
  const pattern = new RegExp(SCORE_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const scoreStart = match.index;
    const scoreEnd = scoreStart + match[0].length;
    const charBefore = scoreStart > 0 ? text[scoreStart - 1] : "";
    const charAfter = scoreEnd < text.length ? text[scoreEnd] : "";
    if (charBefore === "-" || charBefore === "." || charAfter === ".") continue;

    const firstNumber = Number.parseInt(match[1]!, 10);
    const secondNumber = Number.parseInt(match[2]!, 10);
    if (!isValidScore(firstNumber) || !isValidScore(secondNumber)) continue;

    const parsed = assignPairedScores(
      firstNumber,
      secondNumber,
      scoreStart,
      scoreEnd,
      homeMatch,
      awayMatch,
    );
    if (parsed) return parsed;
  }

  return null;
}

function scoreAdjacentToTeam(
  text: string,
  team: TeamMatch,
  otherTeam: TeamMatch,
): number | null {
  const fragment =
    team.index < otherTeam.index
      ? text.slice(teamEnd(team), otherTeam.index)
      : text.slice(teamEnd(team));

  if (/[-:–—]/.test(fragment)) return null;
  return parseSingleScoreToken(fragment);
}

function parseSplitScoreAdjacent(
  text: string,
  homeMatch: TeamMatch,
  awayMatch: TeamMatch,
): ParsedPrediction | null {
  const homeScore = scoreAdjacentToTeam(text, homeMatch, awayMatch);
  const awayScore = scoreAdjacentToTeam(text, awayMatch, homeMatch);
  if (homeScore === null || awayScore === null) return null;
  return { homeScore, awayScore };
}

/**
 * Parse a reply into fixture home/away scores.
 * Each score is assigned to the team named next to it, regardless of mention order.
 */
export function parsePrediction(
  replyText: string,
  fixture: Pick<Fixture, "home" | "away">,
): ParsedPrediction | null {
  const text = normalizeText(replyText);
  if (!text) return null;

  const teams = findBothTeams(text, fixture);
  if (!teams) return null;

  return (
    parsePairedScoreAdjacent(text, teams.homeMatch, teams.awayMatch) ??
    parseSplitScoreAdjacent(text, teams.homeMatch, teams.awayMatch)
  );
}

/** Useful for tests/debugging. */
export function explainPrediction(
  replyText: string,
  fixture: Pick<Fixture, "home" | "away">,
): string {
  const text = normalizeText(replyText);
  const teams = findBothTeams(text, fixture);
  const paired =
    teams &&
    parsePairedScoreAdjacent(text, teams.homeMatch, teams.awayMatch);
  const split =
    teams &&
    parseSplitScoreAdjacent(text, teams.homeMatch, teams.awayMatch);

  return JSON.stringify(
    {
      normalized: text,
      teams,
      paired,
      split,
      result: parsePrediction(replyText, fixture),
    },
    null,
    2,
  );
}

export { SCORE_PATTERN, MAX_SCORE };
