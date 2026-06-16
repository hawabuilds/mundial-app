import type { Fixture } from "@/app/data/fixtures";
import { FIXTURES, fixtureDateTime } from "@/app/data/fixtures";
import {
  getTeamAliases,
  normalizeForTeamMatch,
  textMentionsCuracaoVariant,
  textMentionsTurkiyeVariant,
} from "@/lib/predictionParser";
import {
  getMatchPostAccount,
  matchPostUrl,
  searchRecentPosts,
  type XTweetHit,
} from "@/lib/xApi";

export type DiscoveredMatchPost = {
  tweetId: string;
  text: string;
  url: string;
  account: string;
  source: "fixture" | "database" | "search";
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word / phrase match — avoids "Iran" matching "Iranian", etc. */
export function tweetMentionsTeam(text: string, team: string): boolean {
  if (team === "Curaçao" && textMentionsCuracaoVariant(text)) {
    return true;
  }

  if (
    (team === "Türkiye" || normalizeForTeamMatch(team) === "turkiye") &&
    textMentionsTurkiyeVariant(text)
  ) {
    return true;
  }

  const lower = normalizeForTeamMatch(text);

  return getTeamAliases(team).some((alias) => {
    const normalizedAlias = normalizeForTeamMatch(alias);
    const pattern = new RegExp(
      `(?:^|[^a-z0-9])${escapeRegExp(normalizedAlias)}(?:[^a-z0-9]|$)`,
    );
    return pattern.test(lower);
  });
}

export function tweetMatchesFixture(text: string, fixture: Fixture): boolean {
  return (
    tweetMentionsTeam(text, fixture.home) &&
    tweetMentionsTeam(text, fixture.away)
  );
}

export function tweetIsValidMatchPost(
  hit: Pick<XTweetHit, "text" | "createdAt">,
  fixture: Fixture,
): boolean {
  if (!tweetMatchesFixture(hit.text, fixture)) return false;

  const kickoffMs = fixtureDateTime(fixture).getTime();
  const postedMs = new Date(hit.createdAt).getTime();
  const hoursFromKickoff = (postedMs - kickoffMs) / (60 * 60 * 1000);

  // From 7 days before kickoff up to 2 hours after (covers late posts / index lag).
  return hoursFromKickoff >= -168 && hoursFromKickoff <= 2;
}

function fixturesMentionedInTweet(text: string): Fixture[] {
  return FIXTURES.filter((fixture) => tweetMatchesFixture(text, fixture));
}

/**
 * Prefer a dedicated post for this fixture over a multi-match roundup.
 * Among equals, pick the newest.
 */
export function pickBestTweet(
  hits: XTweetHit[],
  fixture: Fixture,
): XTweetHit | null {
  let best: XTweetHit | null = null;
  let bestTier = -1;
  let bestTime = 0;

  for (const hit of hits) {
    if (!tweetIsValidMatchPost(hit, fixture)) continue;

    const mentioned = fixturesMentionedInTweet(hit.text);
    const isExclusive =
      mentioned.length === 1 && mentioned[0]!.id === fixture.id;
    const tier = isExclusive ? 2 : mentioned.some((f) => f.id === fixture.id) ? 1 : 0;
    if (tier === 0) continue;

    const time = new Date(hit.createdAt).getTime();
    if (tier > bestTier || (tier === bestTier && time > bestTime)) {
      best = hit;
      bestTier = tier;
      bestTime = time;
    }
  }

  return best;
}

function searchAliasTerms(team: string): string[] {
  const terms = getTeamAliases(team)
    .map((alias) => normalizeForTeamMatch(alias))
    .filter((alias) => alias.length >= 3);

  const sorted = [...new Set(terms)].sort((a, b) => {
    const aAscii = /^[a-z0-9\s-]+$/i.test(a) ? 0 : 1;
    const bAscii = /^[a-z0-9\s-]+$/i.test(b) ? 0 : 1;
    if (aAscii !== bAscii) return aAscii - bAscii;
    return b.length - a.length;
  });

  return sorted.slice(0, 4);
}

function quoteSearchTerm(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}

function buildSearchQueries(
  fixture: Fixture,
): Array<{ query: string; pages: number }> {
  const account = getMatchPostAccount();
  const base = `-is:retweet -is:reply from:${account}`;
  const homeTerms = searchAliasTerms(fixture.home).map(quoteSearchTerm);
  const awayTerms = searchAliasTerms(fixture.away).map(quoteSearchTerm);

  if (homeTerms.length === 0 || awayTerms.length === 0) {
    return [];
  }

  const homeOnly = {
    query: `${base} (${homeTerms.join(" OR ")})`,
    pages: 2,
  };
  const bothTeams = {
    query: `${base} (${homeTerms.join(" OR ")}) (${awayTerms.join(" OR ")})`,
    pages: 2,
  };

  // Curaçao is often indexed as Cura??ao — AND queries miss the post; home-only still works.
  if (fixture.away === "Curaçao") {
    return [homeOnly, bothTeams];
  }

  // Türkiye / Turkey / Turkiye — prefer home-only search when Türkiye is home.
  if (fixture.home === "Türkiye") {
    return [homeOnly, bothTeams];
  }

  return [bothTeams, homeOnly];
}

export async function discoverMatchPost(
  fixture: Fixture,
  maxPages = 2,
): Promise<DiscoveredMatchPost | null> {
  const account = getMatchPostAccount();
  const seenIds = new Set<string>();
  const hits: XTweetHit[] = [];

  for (const { query, pages } of buildSearchQueries(fixture)) {
    const pageHits = await searchRecentPosts(
      query,
      Math.min(pages, maxPages),
    );
    for (const hit of pageHits) {
      if (seenIds.has(hit.id)) continue;
      seenIds.add(hit.id);
      hits.push(hit);
    }

    const best = pickBestTweet(hits, fixture);
    if (best) {
      return {
        tweetId: best.id,
        text: best.text,
        url: matchPostUrl(best.id, account),
        account,
        source: "search",
      };
    }
  }

  return null;
}
