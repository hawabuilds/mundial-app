/** Hard cap on X API pagination — ~100 replies/page × 5 pages = max ~500 replies per run. */
export const MAX_PAGES = 5;

const RESULTS_PER_PAGE = 100;
const SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

export type FetchedReply = {
  id: string;
  authorId: string;
  authorUsername: string;
  text: string;
  createdAt: string;
};

type XUser = {
  id: string;
  username: string;
};

type XTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
};

type XSearchResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[] };
  meta?: { next_token?: string; result_count?: number };
  errors?: Array<{ message?: string }>;
  title?: string;
  detail?: string;
};

import { fetchXApi } from "./xApi";

function buildSearchQuery(tweetId: string): string {
  return `in_reply_to_tweet_id:${tweetId} -is:retweet -is:quote`;
}

function mapUsersById(users: XUser[] = []): Map<string, XUser> {
  return new Map(users.map((user) => [user.id, user]));
}

function mapTweetsToReplies(
  tweets: XTweet[],
  usersById: Map<string, XUser>,
): FetchedReply[] {
  const replies: FetchedReply[] = [];

  for (const tweet of tweets) {
    if (!tweet.id || !tweet.author_id || !tweet.created_at) continue;

    const user = usersById.get(tweet.author_id);
    if (!user) continue;

    replies.push({
      id: tweet.id,
      authorId: tweet.author_id,
      authorUsername: user.username,
      text: tweet.text,
      createdAt: tweet.created_at,
    });
  }

  return replies;
}

/**
 * Fetch replies to a match tweet via X API v2 recent search.
 * Stops after maxPages (default {@link MAX_PAGES}) even if more replies exist.
 * Pass sinceId to only return tweets newer than that id (live bot cost control).
 */
export async function fetchReplies(
  tweetId: string,
  options?: { maxPages?: number; sinceId?: string | null },
): Promise<FetchedReply[]> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    throw new Error("Missing X_BEARER_TOKEN");
  }
  const maxPages = Math.max(1, Math.min(options?.maxPages ?? MAX_PAGES, MAX_PAGES));
  const sinceId = options?.sinceId?.trim() || undefined;
  const replies: FetchedReply[] = [];
  let nextToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", buildSearchQuery(tweetId));
    url.searchParams.set("max_results", String(RESULTS_PER_PAGE));
    url.searchParams.set(
      "tweet.fields",
      "author_id,created_at,text,conversation_id,in_reply_to_user_id",
    );
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");
    if (sinceId) {
      url.searchParams.set("since_id", sinceId);
    }

    if (nextToken) {
      url.searchParams.set("next_token", nextToken);
    }

    const response = await fetchXApi(url.toString(), {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "User-Agent": "mundial/1.0",
      },
      cache: "no-store",
    });

    const body = (await response.json()) as XSearchResponse;

    if (!response.ok) {
      const message =
        body.errors?.[0]?.message ||
        body.detail ||
        body.title ||
        `X API error (${response.status})`;
      throw new Error(message);
    }

    const usersById = mapUsersById(body.includes?.users);
    const pageReplies = mapTweetsToReplies(body.data ?? [], usersById);
    replies.push(...pageReplies);

    pagesFetched += 1;
    nextToken = body.meta?.next_token;

    if (!nextToken) {
      break;
    }
  }

  return replies.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export { RESULTS_PER_PAGE };
