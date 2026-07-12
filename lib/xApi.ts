const SEARCH_URL = "https://api.twitter.com/2/tweets/search/recent";

export type XTweetHit = {
  id: string;
  text: string;
  createdAt: string;
  authorUsername: string;
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
  meta?: { next_token?: string };
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

const X_API_RETRY_ATTEMPTS = 4;
const X_API_RETRY_BASE_MS = 2_000;

function isRetryableXStatus(status: number): boolean {
  return status === 503 || status === 502 || status === 429;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchXApi(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < X_API_RETRY_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, init);
    lastResponse = response;
    if (response.ok || !isRetryableXStatus(response.status)) {
      return response;
    }
    if (attempt < X_API_RETRY_ATTEMPTS - 1) {
      await sleep(X_API_RETRY_BASE_MS * (attempt + 1));
    }
  }
  return lastResponse!;
}

export function getMatchPostAccount(): string {
  const account = process.env.X_MATCH_ACCOUNT?.trim() || "copamundialapp";
  return account.replace(/^@/, "");
}

export function matchPostUrl(tweetId: string, account?: string): string {
  const handle = account ?? getMatchPostAccount();
  return `https://x.com/${handle}/status/${tweetId}`;
}

export function matchReplyIntentUrl(
  tweetId: string,
  prefilledText?: string,
): string {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("in_reply_to", tweetId);
  if (prefilledText?.trim()) {
    url.searchParams.set("text", prefilledText.trim());
  }
  return url.toString();
}

export async function searchRecentPosts(
  query: string,
  maxPages = 2,
): Promise<XTweetHit[]> {
  const bearerToken = getBearerToken();
  const hits: XTweetHit[] = [];
  let nextToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("tweet.fields", "author_id,created_at,text");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "username");

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

    const usersById = new Map(
      (body.includes?.users ?? []).map((user) => [user.id, user.username]),
    );

    for (const tweet of body.data ?? []) {
      if (!tweet.author_id || !tweet.created_at) continue;
      const authorUsername = usersById.get(tweet.author_id);
      if (!authorUsername) continue;

      hits.push({
        id: tweet.id,
        text: tweet.text,
        createdAt: tweet.created_at,
        authorUsername,
      });
    }

    pagesFetched += 1;
    nextToken = body.meta?.next_token;
    if (!nextToken) break;
  }

  return hits;
}

const TWEET_LOOKUP_URL = "https://api.twitter.com/2/tweets";

type XTweetLookupResponse = {
  data?: XTweet;
  includes?: { users?: XUser[] };
  errors?: Array<{ message?: string }>;
  title?: string;
  detail?: string;
};

/** Load a single tweet by id (validates cached match posts). */
export async function fetchTweetById(tweetId: string): Promise<XTweetHit | null> {
  const bearerToken = getBearerToken();
  const url = new URL(`${TWEET_LOOKUP_URL}/${tweetId}`);
  url.searchParams.set("tweet.fields", "author_id,created_at,text");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");

  const response = await fetchXApi(url.toString(), {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "User-Agent": "mundial/1.0",
    },
    cache: "no-store",
  });

  const body = (await response.json()) as XTweetLookupResponse;

  if (!response.ok) {
    if (response.status === 404) return null;
    const message =
      body.errors?.[0]?.message ||
      body.detail ||
      body.title ||
      `X API error (${response.status})`;
    throw new Error(message);
  }

  const tweet = body.data;
  if (!tweet?.author_id || !tweet.created_at) return null;

  const authorUsername = body.includes?.users?.find(
    (user) => user.id === tweet.author_id,
  )?.username;
  if (!authorUsername) return null;

  return {
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at,
    authorUsername,
  };
}
