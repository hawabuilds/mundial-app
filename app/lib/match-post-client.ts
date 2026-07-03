export type MatchPostResponse = {
  matchId: number;
  fixture: string;
  found: boolean;
  tweetId?: string;
  postUrl?: string;
  replyIntentUrl?: string;
  account?: string;
  source?: string;
  exampleReply?: string;
  hint?: string;
  error?: string;
};

export type MatchPostLookup = {
  home: string;
  away: string;
  date: string;
  time: string;
};

/**
 * Resolve the X match thread for a fixture. Pass `lookup` (teams + kickoff) for
 * board fixtures whose id is not a static fixture id — the server then discovers
 * the post by team names instead of requiring a static match id.
 */
export async function fetchMatchPost(
  matchId: number,
  lookup?: MatchPostLookup,
): Promise<MatchPostResponse> {
  const params = new URLSearchParams({ matchId: String(matchId) });
  if (lookup) {
    params.set("home", lookup.home);
    params.set("away", lookup.away);
    params.set("date", lookup.date);
    params.set("time", lookup.time);
  }

  const response = await fetch(`/api/match-post?${params.toString()}`, {
    cache: "no-store",
  });

  const data = (await response.json()) as MatchPostResponse;
  if (!response.ok) {
    return {
      matchId,
      fixture: "",
      found: false,
      error: data.error ?? `Match post lookup failed (${response.status})`,
      hint: data.hint,
    };
  }

  return data;
}

export function openXReply(replyIntentUrl: string): void {
  window.open(replyIntentUrl, "_blank", "noopener,noreferrer");
}
