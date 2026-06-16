const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "do",
  "does",
  "did",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "and",
  "or",
  "i",
  "my",
  "me",
  "it",
  "this",
  "that",
  "you",
  "your",
  "can",
  "will",
  "we",
  "our",
]);

const MIN_PHRASE_SUBSTRING_LENGTH = 4;

export function normalizeFaqSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\$score/g, "score")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryRegex(token: string): RegExp {
  if (isCjk(token)) {
    return new RegExp(escapeRegExp(token), "iu");
  }

  return new RegExp(`\\b${escapeRegExp(token)}\\b`, "iu");
}

export function tokenizeFaqQuery(query: string): string[] {
  const normalized = normalizeFaqSearchText(query);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ").filter(Boolean);

  if (isCjk(normalized) && !normalized.includes(" ")) {
    return [normalized];
  }

  return words.filter((word) => {
    if (isCjk(word)) {
      return word.length >= 1;
    }
    return word.length > 1 && !STOP_WORDS.has(word);
  });
}

function haystackContainsToken(haystack: string, token: string): boolean {
  if (wordBoundaryRegex(token).test(haystack)) {
    return true;
  }

  if (token.endsWith("s") && token.length > 3) {
    const singular = token.slice(0, -1);
    if (wordBoundaryRegex(singular).test(haystack)) {
      return true;
    }
  }

  if (!token.endsWith("s") && token.length > 2) {
    if (wordBoundaryRegex(`${token}s`).test(haystack)) {
      return true;
    }
  }

  return false;
}

function indexOfWord(haystack: string, token: string, fromIndex = 0): number {
  const regex = wordBoundaryRegex(token);
  regex.lastIndex = fromIndex;
  const match = regex.exec(haystack);
  return match?.index ?? -1;
}

function tokensAppearInOrder(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return false;
  }

  let fromIndex = 0;
  for (const token of tokens) {
    const pos = indexOfWord(haystack, token, fromIndex);
    if (pos === -1) {
      return false;
    }
    fromIndex = pos + token.length;
  }

  return true;
}

function scoreKeywordPhrases(
  normalizedQuery: string,
  keywordPhrases: readonly string[],
): number {
  const queryTokens = tokenizeFaqQuery(normalizedQuery);

  for (const phrase of keywordPhrases) {
    const normalizedPhrase = normalizeFaqSearchText(phrase);
    if (!normalizedPhrase) {
      continue;
    }

    if (normalizedQuery === normalizedPhrase) {
      return 1000;
    }

    if (
      normalizedPhrase.length >= MIN_PHRASE_SUBSTRING_LENGTH &&
      normalizedQuery.includes(normalizedPhrase)
    ) {
      return 1000;
    }

    if (
      normalizedQuery.length >= MIN_PHRASE_SUBSTRING_LENGTH &&
      normalizedPhrase.includes(normalizedQuery)
    ) {
      return 1000;
    }

    const phraseTokens = tokenizeFaqQuery(normalizedPhrase);
    if (
      phraseTokens.length > 0 &&
      queryTokens.length > 0 &&
      tokensAppearInOrder(normalizedPhrase, queryTokens)
    ) {
      return 950;
    }
  }

  return 0;
}

function countMatchingTokens(haystack: string, tokens: string[]): number {
  return tokens.filter((token) => haystackContainsToken(haystack, token)).length;
}

/** Higher = better match. Used to rank FAQ results. */
export function faqSearchScore(
  haystack: string,
  query: string,
  keywordPhrases: readonly string[] = [],
): number {
  const normalizedHaystack = normalizeFaqSearchText(haystack);
  const normalizedQuery = normalizeFaqSearchText(query);

  if (!normalizedQuery) {
    return 1;
  }

  const keywordScore = scoreKeywordPhrases(normalizedQuery, keywordPhrases);
  if (keywordScore > 0) {
    return keywordScore;
  }

  if (
    normalizedQuery.length >= MIN_PHRASE_SUBSTRING_LENGTH &&
    normalizedHaystack.includes(normalizedQuery)
  ) {
    return 1000;
  }

  const tokens = tokenizeFaqQuery(query);
  if (tokens.length === 0) {
    return normalizedHaystack.includes(normalizedQuery) ? 500 : 0;
  }

  if (tokensAppearInOrder(normalizedHaystack, tokens)) {
    return 900;
  }

  const matched = countMatchingTokens(normalizedHaystack, tokens);
  if (matched === 0) {
    return 0;
  }

  if (matched === tokens.length) {
    return 100 + matched * 10;
  }

  const threshold = Math.max(1, Math.ceil(tokens.length / 2));
  if (matched >= threshold) {
    return 50 + matched * 10;
  }

  return 0;
}

export function isTaxRelatedQuery(query: string): boolean {
  const normalized = normalizeFaqSearchText(query);
  if (!normalized) {
    return false;
  }

  const taxTerms = ["tax", "taxes", "fee", "fees", "税费", "税", "3%", "3/3"];
  if (taxTerms.some((term) => haystackContainsToken(normalized, term))) {
    return true;
  }

  return tokenizeFaqQuery(query).some((token) =>
    ["tax", "taxes", "fee", "fees", "税费", "税"].includes(token),
  );
}

export function isClaimRelatedQuery(query: string): boolean {
  const normalized = normalizeFaqSearchText(query);
  if (!normalized) {
    return false;
  }

  const claimTerms = [
    "claim",
    "claiming",
    "withdraw",
    "领取",
    "怎么领",
    "如何领取",
  ];
  return claimTerms.some((term) => haystackContainsToken(normalized, term));
}

/** True when the query matches strongly enough to show this FAQ item. */
export function faqMatchesSearch(
  haystack: string,
  query: string,
  keywordPhrases: readonly string[] = [],
): boolean {
  return faqSearchScore(haystack, query, keywordPhrases) > 0;
}
