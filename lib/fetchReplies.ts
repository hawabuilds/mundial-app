/** Hard cap on X API pagination — ~100 replies/page × 5 pages = max ~500 replies per run. */
export const MAX_PAGES = 5;

const RESULTS_PER_PAGE = 100;
const SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

export type FetchedReply = {
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

function getBearerToken(): string {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    throw new Error("Missing X_BEARER_TOKEN");
  }
  return token;
}

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
    if (!tweet.author_id || !tweet.created_at) continue;

    const user = usersById.get(tweet.author_id);
    if (!user) continue;

    replies.push({
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
 * Stops after MAX_PAGES even if more replies exist.
 */
export async function fetchReplies(tweetId: string): Promise<FetchedReply[]> {
  const bearerToken = getBearerToken();
  const replies: FetchedReply[] = [];
  let nextToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGES) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", buildSearchQuery(tweetId));
    url.searchParams.set("max_results", String(RESULTS_PER_PAGE));
    url.searchParams.set(
      "tweet.fields",
      "author_id,created_at,text,conversation_id,in_reply_to_user_id",
    );
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");

    if (nextToken) {
      url.searchParams.set("next_token", nextToken);
    }

    const response = await fetch(url.toString(), {
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
