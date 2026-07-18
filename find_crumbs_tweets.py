#!/usr/bin/env python3
"""
Search the X (Twitter) full-archive endpoint for tweets about the
crumbs.robinhood.com easter egg that are OLDER than one year.

Requires:
  - An X API bearer token with full-archive ("/tweets/search/all") access
    (Pro or Enterprise tier; Academic in the old plan). Basic/Free CANNOT
    reach this endpoint.
  - pip install requests

Usage:
  export X_BEARER_TOKEN="your_token_here"     # never hardcode it
  python find_crumbs_tweets.py
"""

import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

SEARCH_URL = "https://api.twitter.com/2/tweets/search/all"

# Tweets must be strictly older than this (now - 365 days).
END_TIME = datetime.now(timezone.utc) - timedelta(days=365)

# Full-archive can't go earlier than X's first tweet.
START_TIME = datetime(2006, 3, 21, tzinfo=timezone.utc)

# Try several phrasings; the URL match alone often misses things.
QUERIES = [
    'crumbs.robinhood.com',
    '"crumbs.robinhood.com"',
    'robinhood Hansel Gretel',
    'to:RobinhoodApp (Hansel OR Gretel OR crumbs)',
    'from:RobinhoodApp (Hansel OR Gretel OR crumbs)',
]


def get_token() -> str:
    token = os.environ.get("X_BEARER_TOKEN")
    if not token:
        sys.exit("ERROR: set X_BEARER_TOKEN in your environment first.")
    return token


def search(query: str, token: str):
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "query": query,
        "start_time": START_TIME.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_time": END_TIME.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "max_results": 100,  # per page (10–500 depending on access level)
        "tweet.fields": "created_at,author_id,conversation_id",
        "expansions": "author_id",
        "user.fields": "username",
    }

    results = []
    users = {}
    next_token = None

    while True:
        if next_token:
            params["next_token"] = next_token
        else:
            params.pop("next_token", None)

        resp = requests.get(SEARCH_URL, headers=headers, params=params, timeout=30)

        # Basic rate-limit courtesy: full-archive is ~1 request/second.
        if resp.status_code == 429:
            reset = int(resp.headers.get("x-rate-limit-reset", time.time() + 60))
            wait = max(reset - int(time.time()), 5)
            print(f"  rate limited; sleeping {wait}s...")
            time.sleep(wait)
            continue

        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:300]}")
            break

        payload = resp.json()

        for u in payload.get("includes", {}).get("users", []):
            users[u["id"]] = u["username"]

        results.extend(payload.get("data", []))

        next_token = payload.get("meta", {}).get("next_token")
        if not next_token:
            break

        time.sleep(1.1)  # stay under the endpoint's rate cap

    return results, users


def main():
    token = get_token()
    seen = set()

    print(f"Searching for tweets before {END_TIME.date()} (older than 1 year)\n")

    for q in QUERIES:
        print(f"Query: {q}")
        tweets, users = search(q, token)
        print(f"  {len(tweets)} result(s)\n")

        for t in tweets:
            tid = t["id"]
            if tid in seen:
                continue
            seen.add(tid)

            uname = users.get(t.get("author_id"), t.get("author_id"))
            created = t.get("created_at", "?")
            text = " ".join(t.get("text", "").split())
            url = f"https://x.com/{uname}/status/{tid}"

            print(f"[{created}] @{uname}")
            print(f"  {text}")
            print(f"  {url}\n")

        time.sleep(1.1)

    print(f"Done. {len(seen)} unique tweet(s) older than one year.")


if __name__ == "__main__":
    main()