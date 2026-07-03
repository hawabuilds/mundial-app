import { WORLD_CUP_2026_FIXTURES } from "@/app/data/fixtures";

/** Host cities for World Cup 2026 fixtures (FIFA group stage schedule). */
export type MatchVenue = {
  city: string;
  country: string;
  stadium: string;
};

const VENUES: Record<number, MatchVenue> = {
  1: { city: "Mexico City", country: "Mexico", stadium: "Estadio Azteca" },
  2: { city: "Guadalajara", country: "Mexico", stadium: "Estadio Akron" },
  3: { city: "Toronto", country: "Canada", stadium: "BMO Field" },
  4: { city: "Los Angeles", country: "USA", stadium: "SoFi Stadium" },
  5: { city: "Santa Clara", country: "USA", stadium: "Levi's Stadium" },
  6: { city: "East Rutherford", country: "USA", stadium: "MetLife Stadium" },
  7: { city: "Foxborough", country: "USA", stadium: "Gillette Stadium" },
  8: { city: "Vancouver", country: "Canada", stadium: "BC Place" },
  9: { city: "Houston", country: "USA", stadium: "NRG Stadium" },
  10: { city: "Arlington", country: "USA", stadium: "AT&T Stadium" },
  11: { city: "Philadelphia", country: "USA", stadium: "Lincoln Financial Field" },
  12: { city: "Monterrey", country: "Mexico", stadium: "Estadio BBVA" },
  13: { city: "Atlanta", country: "USA", stadium: "Mercedes-Benz Stadium" },
  14: { city: "Seattle", country: "USA", stadium: "Lumen Field" },
  15: { city: "Miami Gardens", country: "USA", stadium: "Hard Rock Stadium" },
  16: { city: "Los Angeles", country: "USA", stadium: "SoFi Stadium" },
  17: { city: "East Rutherford", country: "USA", stadium: "MetLife Stadium" },
  18: { city: "Foxborough", country: "USA", stadium: "Gillette Stadium" },
  19: { city: "Kansas City", country: "USA", stadium: "Arrowhead Stadium" },
  20: { city: "Santa Clara", country: "USA", stadium: "Levi's Stadium" },
  21: { city: "Houston", country: "USA", stadium: "NRG Stadium" },
  22: { city: "Arlington", country: "USA", stadium: "AT&T Stadium" },
  23: { city: "Toronto", country: "Canada", stadium: "BMO Field" },
  24: { city: "Mexico City", country: "Mexico", stadium: "Estadio Azteca" },
  25: { city: "Atlanta", country: "USA", stadium: "Mercedes-Benz Stadium" },
  26: { city: "Los Angeles", country: "USA", stadium: "SoFi Stadium" },
  27: { city: "Vancouver", country: "Canada", stadium: "BC Place" },
  28: { city: "Guadalajara", country: "Mexico", stadium: "Estadio Akron" },
  29: { city: "Seattle", country: "USA", stadium: "Lumen Field" },
  30: { city: "Foxborough", country: "USA", stadium: "Gillette Stadium" },
  31: { city: "Philadelphia", country: "USA", stadium: "Lincoln Financial Field" },
  32: { city: "Santa Clara", country: "USA", stadium: "Levi's Stadium" },
  33: { city: "Houston", country: "USA", stadium: "NRG Stadium" },
  34: { city: "Toronto", country: "Canada", stadium: "BMO Field" },
  35: { city: "Kansas City", country: "USA", stadium: "Arrowhead Stadium" },
  36: { city: "Monterrey", country: "Mexico", stadium: "Estadio BBVA" },
  37: { city: "Atlanta", country: "USA", stadium: "Mercedes-Benz Stadium" },
  38: { city: "Los Angeles", country: "USA", stadium: "SoFi Stadium" },
  39: { city: "Miami Gardens", country: "USA", stadium: "Hard Rock Stadium" },
  40: { city: "Vancouver", country: "Canada", stadium: "BC Place" },
  41: { city: "Arlington", country: "USA", stadium: "AT&T Stadium" },
  42: { city: "Philadelphia", country: "USA", stadium: "Lincoln Financial Field" },
  43: { city: "East Rutherford", country: "USA", stadium: "MetLife Stadium" },
  44: { city: "Santa Clara", country: "USA", stadium: "Levi's Stadium" },
  45: { city: "Houston", country: "USA", stadium: "NRG Stadium" },
  46: { city: "Foxborough", country: "USA", stadium: "Gillette Stadium" },
  47: { city: "Toronto", country: "Canada", stadium: "BMO Field" },
  48: { city: "Guadalajara", country: "Mexico", stadium: "Estadio Akron" },
  49: { city: "Vancouver", country: "Canada", stadium: "BC Place" },
  50: { city: "Seattle", country: "USA", stadium: "Lumen Field" },
  51: { city: "Miami Gardens", country: "USA", stadium: "Hard Rock Stadium" },
  52: { city: "Atlanta", country: "USA", stadium: "Mercedes-Benz Stadium" },
  53: { city: "Monterrey", country: "Mexico", stadium: "Estadio BBVA" },
  54: { city: "Mexico City", country: "Mexico", stadium: "Estadio Azteca" },
  55: { city: "Philadelphia", country: "USA", stadium: "Lincoln Financial Field" },
  56: { city: "East Rutherford", country: "USA", stadium: "MetLife Stadium" },
  57: { city: "Kansas City", country: "USA", stadium: "Arrowhead Stadium" },
  58: { city: "Arlington", country: "USA", stadium: "AT&T Stadium" },
  59: { city: "Santa Clara", country: "USA", stadium: "Levi's Stadium" },
  60: { city: "Los Angeles", country: "USA", stadium: "SoFi Stadium" },
  61: { city: "Foxborough", country: "USA", stadium: "Gillette Stadium" },
  62: { city: "Toronto", country: "Canada", stadium: "BMO Field" },
  63: { city: "Houston", country: "USA", stadium: "NRG Stadium" },
  64: { city: "Guadalajara", country: "Mexico", stadium: "Estadio Akron" },
  65: { city: "Seattle", country: "USA", stadium: "Lumen Field" },
  66: { city: "Vancouver", country: "Canada", stadium: "BC Place" },
  67: { city: "Philadelphia", country: "USA", stadium: "Lincoln Financial Field" },
  68: { city: "East Rutherford", country: "USA", stadium: "MetLife Stadium" },
  69: { city: "Miami Gardens", country: "USA", stadium: "Hard Rock Stadium" },
  70: { city: "Atlanta", country: "USA", stadium: "Mercedes-Benz Stadium" },
  71: { city: "Kansas City", country: "USA", stadium: "Arrowhead Stadium" },
  72: { city: "Arlington", country: "USA", stadium: "AT&T Stadium" },
};

export function getVenueForMatch(matchId: number): MatchVenue {
  return (
    VENUES[matchId] ?? {
      city: "TBD",
      country: "World Cup 2026",
      stadium: "Venue TBD",
    }
  );
}

export function formatVenueLine(venue: MatchVenue): string {
  return `${venue.stadium} · ${venue.city}, ${venue.country}`;
}

function normalizeTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Venue line for a live-board fixture. TxLINE gives no stadium/city, so we match
 * the fixture back to the static World Cup 2026 schedule by team names (and,
 * where possible, kickoff date) and reuse that match's known venue. Returns ""
 * when the teams are not part of the real tournament schedule.
 */
export function venueLineForMatch(
  home: string,
  away: string,
  date?: string,
): string {
  const h = normalizeTeam(home);
  const a = normalizeTeam(away);

  const candidates = WORLD_CUP_2026_FIXTURES.filter((fixture) => {
    const fh = normalizeTeam(fixture.home);
    const fa = normalizeTeam(fixture.away);
    return (fh === h && fa === a) || (fh === a && fa === h);
  });
  if (candidates.length === 0) return "";

  const match =
    (date ? candidates.find((fixture) => fixture.date === date) : undefined) ??
    candidates[0]!;

  const venue = getVenueForMatch(match.id);
  if (venue.city === "TBD") return "";
  return formatVenueLine(venue);
}

/** World Cup branding without naming the governing body. */
export function sanitizeTournamentLabel(group: string): string {
  return group
    .replace(/FIFA\s+World\s+Cup/gi, "World Cup 2026")
    .replace(/\s+/g, " ")
    .trim();
}

/** Card meta label — strips matchday numbers; hides generic tournament-only strings. */
export function fixtureMetaLabel(group: string): string | null {
  const label = sanitizeTournamentLabel(group)
    .replace(/\s*[·•|]\s*matchday\s*\d+\s*/gi, " ")
    .replace(/\bmatchday\s*\d+\b\s*[·•|]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!label || /^world cup 2026$/i.test(label)) return null;
  return label;
}
