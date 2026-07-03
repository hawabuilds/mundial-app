// Shared team-name matching (client + server safe — no Node imports).

function normalizeTeamName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string[]> = {
  usa: ["united states", "u s a", "us"],
  "bosnia herzegovina": ["bosnia", "bih", "bosnia & herzegovina"],
  "cape verde": ["cabo verde", "cape verde islands"],
  "fyr macedonia": ["north macedonia", "macedonia", "mk"],
  curacao: ["curaçao", "curacao"],
  "south korea": ["korea republic", "republic of korea"],
  "ivory coast": ["cote d ivoire", "cote divoire"],
  turkiye: ["turkey"],
  "congo dr": ["dr congo", "democratic republic of congo", "congo democratic republic"],
  "czech republic": ["czechia"],
  iran: ["ir iran", "team melli"],
  "south africa": ["rsa", "bafana bafana"],
  "republic of ireland": ["rep of ireland", "ireland"],
};

export function teamNamesMatch(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;

  for (const [key, values] of Object.entries(TEAM_ALIASES)) {
    const names = [key, ...values];
    const xHit = names.some((n) => x.includes(n) || n.includes(x));
    const yHit = names.some((n) => y.includes(n) || n.includes(y));
    if (xHit && yHit) return true;
  }
  return false;
}
