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

export async function fetchMatchPost(matchId: number): Promise<MatchPostResponse> {
  const response = await fetch(`/api/match-post?matchId=${matchId}`, {
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
