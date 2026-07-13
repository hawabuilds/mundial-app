import { createHmac, randomBytes } from "node:crypto";

export type XUserOAuth1Credentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

/** Read OAuth 1.0a user-context credentials for posting as @copamundialapp. */
export function readXUserOAuth1Credentials(): XUserOAuth1Credentials | null {
  const apiKey = process.env.X_API_KEY?.trim();
  const apiSecret = process.env.X_API_SECRET?.trim();
  const accessToken = process.env.X_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildOAuth1Header(
  method: string,
  url: string,
  credentials: XUserOAuth1Credentials,
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(oauth)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(oauth[key]!)}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(
    credentials.accessTokenSecret,
  )}`;

  oauth.oauth_signature = createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const header = Object.keys(oauth)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauth[key]!)}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export type PostTweetResult =
  | { ok: true; tweetId: string }
  | { ok: false; status: number; error: string; rateLimited: boolean };

/**
 * Create a tweet (optionally as a reply) via X API v2 with OAuth 1.0a user context.
 * Does not retry on 429 — caller must back off.
 */
export async function postTweetAsUser(input: {
  text: string;
  inReplyToTweetId?: string;
  credentials?: XUserOAuth1Credentials | null;
}): Promise<PostTweetResult> {
  const credentials = input.credentials ?? readXUserOAuth1Credentials();
  if (!credentials) {
    return {
      ok: false,
      status: 0,
      error:
        "Missing X OAuth1 write credentials (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)",
      rateLimited: false,
    };
  }

  const url = "https://api.twitter.com/2/tweets";
  const body: {
    text: string;
    reply?: { in_reply_to_tweet_id: string };
  } = { text: input.text };
  if (input.inReplyToTweetId?.trim()) {
    body.reply = { in_reply_to_tweet_id: input.inReplyToTweetId.trim() };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: buildOAuth1Header("POST", url, credentials),
        "Content-Type": "application/json",
        "User-Agent": "mundial/1.0",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "fetch failed",
      rateLimited: false,
    };
  }

  const json = (await response.json().catch(() => ({}))) as {
    data?: { id?: string };
    errors?: Array<{ message?: string }>;
    detail?: string;
    title?: string;
  };

  if (!response.ok) {
    const message =
      json.errors?.[0]?.message ||
      json.detail ||
      json.title ||
      `X API error (${response.status})`;
    return {
      ok: false,
      status: response.status,
      error: message,
      rateLimited: response.status === 429,
    };
  }

  const tweetId = json.data?.id?.trim();
  if (!tweetId) {
    return {
      ok: false,
      status: response.status,
      error: "X API returned no tweet id",
      rateLimited: false,
    };
  }

  return { ok: true, tweetId };
}
