export function buildReplyIntentUrl(tweetId: string, prefilledText: string): string {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("in_reply_to", tweetId);
  url.searchParams.set("text", prefilledText.trim());
  return url.toString();
}
