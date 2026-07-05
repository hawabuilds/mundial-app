/** "Surname, First" -> "First Surname"; leaves single-token names as-is. */
export function formatPlayerFullName(preferred: string | null | undefined): string | null {
  if (!preferred) return null;
  const parts = preferred.split(",").map((s) => s.trim());
  if (parts.length >= 2 && parts[1]) return `${parts[1]} ${parts[0]}`.trim();
  return preferred.trim();
}

const SURNAME_PARTICLES = new Set([
  "da",
  "de",
  "del",
  "di",
  "dos",
  "das",
  "van",
  "von",
  "le",
  "la",
  "el",
  "al",
]);

function isSurnameParticle(token: string): boolean {
  return SURNAME_PARTICLES.has(token.toLowerCase());
}

/**
 * Short scorer label from TxLINE preferredName ("Surname, First").
 * - "Mbappe Lottin, Kylian" → "K. Mbappe"
 * - "da Silva Santos Junior, Neymar" → "Neymar" (particle-led surnames)
 */
export function formatPlayerShortName(preferred: string | null | undefined): string | null {
  if (!preferred) return null;
  const trimmed = preferred.trim();
  const comma = trimmed.split(",").map((s) => s.trim());
  if (comma.length >= 2 && comma[0] && comma[1]) {
    const firstName = comma[1].split(/\s+/).filter(Boolean)[0];
    const surnameTokens = comma[0].split(/\s+/).filter(Boolean);
    if (firstName) {
      const particleLed =
        surnameTokens.length > 0 && isSurnameParticle(surnameTokens[0]!);
      if (particleLed || surnameTokens.length >= 3) {
        return firstName;
      }
      const surname = surnameTokens[0]!;
      return `${firstName.charAt(0).toUpperCase()}. ${surname}`;
    }
  }
  return shortNameFromFull(formatPlayerFullName(trimmed) ?? trimmed);
}

/** e.g. "Lionel Messi" → "L. Messi" (fallback when comma form is unavailable). */
export function shortNameFromFull(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return full;
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]!.charAt(0).toUpperCase()}. ${parts[parts.length - 1]!}`;
}

/** UI label for goal scorers — prefers TxLINE short name. */
export function goalScorerDisplayName(goal: {
  player: string | null;
  playerShort?: string | null;
}): string | null {
  if (goal.playerShort) return goal.playerShort;
  if (goal.player) return shortNameFromFull(goal.player);
  return null;
}
