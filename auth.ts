import NextAuth from "next-auth";
import {
  isTwitterNumericUserId,
  pickTwitterUserIdFromToken,
} from "./lib/twitterUserId";
import Twitter from "next-auth/providers/twitter";

const USER_FIELDS = "user.fields=id,name,username,profile_image_url";
const USERINFO_URLS = [
  `https://api.x.com/2/users/me?${USER_FIELDS}`,
  `https://api.twitter.com/2/users/me?${USER_FIELDS}`,
] as const;

type TwitterUserData = {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  profile_image_url?: string;
};

type TwitterUserinfo = {
  data?: TwitterUserData;
  errors?: Array<{ message?: string; title?: string }>;
};

async function fetchTwitterUser(
  accessToken: string,
): Promise<TwitterUserinfo | null> {
  for (const url of USERINFO_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "mundial",
        },
      });
      const body = (await res.json()) as TwitterUserinfo & TwitterUserData;

      if (body?.data?.id) return body;
      if (body?.id) return { data: body };

      console.error("[auth][twitter] userinfo missing id", {
        url,
        status: res.status,
        body,
      });
    } catch (err) {
      console.error("[auth][twitter] userinfo request failed", { url, err });
    }
  }

  return null;
}

function extractTwitterUser(raw: unknown): TwitterUserData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as TwitterUserinfo & TwitterUserData;
  if (record.data?.id) return record.data;
  if (record.id) return record;

  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  debug: process.env.AUTH_DEBUG === "true",
  pages: {
    error: "/",
    signIn: "/",
  },
  providers: [
    Twitter({
      clientId: process.env.AUTH_TWITTER_ID,
      clientSecret: process.env.AUTH_TWITTER_SECRET,
      userinfo: {
        url: USERINFO_URLS[0],
        async request({ tokens }: { tokens: { access_token?: string | null } }) {
          const accessToken = tokens.access_token;
          if (!accessToken) {
            return { errors: [{ message: "Missing X access token" }] };
          }
          const profile = await fetchTwitterUser(accessToken);
          return profile ?? { errors: [{ message: "Could not load X profile" }] };
        },
      },
      async profile(raw, tokens) {
        let user = extractTwitterUser(raw);

        if (!user?.id && tokens.access_token) {
          const retry = await fetchTwitterUser(tokens.access_token);
          user = extractTwitterUser(retry);
        }

        if (!user?.id) {
          console.error("[auth][twitter] profile missing id", raw);
          throw new TypeError("Twitter user id missing from X API response");
        }

        const username = user.username?.replace(/^@/, "").trim();
        const name = username
          ? `@${username}`
          : user.name?.trim() || `user_${user.id}`;

        return {
          id: user.id,
          name,
          email: user.email ?? null,
          image: user.profile_image_url ?? null,
          username: username ?? null,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, profile }) {
      if (user && "username" in user && typeof user.username === "string") {
        token.username = user.username.replace(/^@/, "").trim() || null;
      } else if (profile && typeof profile === "object" && "username" in profile) {
        const fromProfile = (profile as { username?: string | null }).username;
        token.username =
          typeof fromProfile === "string"
            ? fromProfile.replace(/^@/, "").trim() || null
            : null;
      } else if (
        user &&
        typeof user.name === "string" &&
        user.name.trim().startsWith("@")
      ) {
        token.username = user.name.trim().replace(/^@/, "") || null;
      }

      const candidates = [
        user?.id != null ? String(user.id) : null,
        profile && typeof profile === "object" && "id" in profile
          ? String((profile as { id?: string | number }).id ?? "")
          : null,
        typeof token.twitterId === "string" ? token.twitterId : null,
        typeof token.sub === "string" ? token.sub : null,
      ];

      for (const candidate of candidates) {
        if (isTwitterNumericUserId(candidate)) {
          token.twitterId = candidate!.trim();
          token.sub = candidate!.trim();
          break;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const twitterId = pickTwitterUserIdFromToken({
          twitterId:
            typeof token.twitterId === "string" ? token.twitterId : null,
          sub: typeof token.sub === "string" ? token.sub : null,
        });

        if (twitterId) {
          session.user.id = twitterId;
        }

        session.user.username =
          typeof token.username === "string" ? token.username : null;
      }
      return session;
    },
  },
});
