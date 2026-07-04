/**
 * Tournament stage labels for match cards (no "World Cup" branding).
 *
 * TxLINE often sends Competition: "World Cup" with no round — we only label a
 * stage when the competition string or static schedule gives us one. No guessing.
 */

/** International friendlies — excluded from the live board. */
export function isFriendlyCompetition(competition: string): boolean {
  const c = competition.trim().toLowerCase();
  if (!c) return false;
  return (
    /\bfriendl/i.test(c) ||
    /\binternational\s+match\b/i.test(c) ||
    /\bclub\s+friendl/i.test(c)
  );
}

export function isWorldCupCompetition(competition: string): boolean {
  return /world\s*cup/i.test(competition) && !isFriendlyCompetition(competition);
}

/** First knockout day on the 2026 calendar (group stage ends 27 June). */
const WC_2026_KNOCKOUT_FROM = "2026-06-28";

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type MatchStageOptions = {
  matchId?: number;
  fixtureGroupId?: number;
  date?: string;
};

/**
 * Top-left card label: knockout round, group letter, or "Group stage".
 * Returns null when the round is unknown (e.g. bare "World Cup" from TxLINE).
 */
export function matchStageLabel(
  competition: string,
  opts?: MatchStageOptions,
): string | null {
  const raw = competition.trim();
  if (!raw || isFriendlyCompetition(raw)) return null;

  if (/round\s*of\s*32|last\s*32\b|round\s*32\b/i.test(raw)) {
    return "Round of 32";
  }
  if (/round\s*of\s*16|last\s*16\b|round\s*16\b/i.test(raw)) {
    return "Round of 16";
  }
  if (/quarter[-\s]?final/i.test(raw)) return "Quarter-finals";
  if (/semi[-\s]?final/i.test(raw)) return "Semi-finals";
  if (/third[-\s]?place|3rd\s*place/i.test(raw)) return "Third place";
  if (/\bfinal\b/i.test(raw) && !/quarter|semi|round\s*of/i.test(raw)) {
    return "Final";
  }

  const groupLetter = raw.match(/\bgroup\s+([A-L])\b/i);
  if (groupLetter) return `Group ${groupLetter[1]!.toUpperCase()}`;

  const stripped = raw
    .replace(/^FIFA\s+/i, "")
    .replace(/world\s*cup(\s*2026)?/gi, " ")
    .replace(/\s*[·•|]\s*matchday\s*\d+\s*/gi, " ")
    .replace(/\bmatchday\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^group\s+stage$/i.test(stripped)) return "Group stage";
  if (/\bgroup\s+([A-L])\b/i.test(stripped)) {
    return `Group ${stripped.match(/\bgroup\s+([A-L])\b/i)![1]!.toUpperCase()}`;
  }

  // Bare "World Cup" from TxLINE — no round in the feed; don't invent one.
  if (/^world\s*cup$/i.test(raw) || /^world\s*cup$/i.test(stripped)) {
    return null;
  }

  if (/\bmatchday\s*\d+\b/i.test(raw) || (opts?.date && opts.date < WC_2026_KNOCKOUT_FROM)) {
    return "Group stage";
  }

  if (stripped && !/world\s*cup/i.test(stripped)) {
    return titleCaseWords(stripped);
  }

  return null;
}
