"use client";

import { useCallback, useState } from "react";
import { fetchMatchPost } from "@/app/lib/match-post-client";
import { formatExampleReply } from "../lib/kickoff";
import type { MundialFixture } from "../lib/fixtures";
import { buildReplyIntentUrl } from "../lib/reply-intent";
import styles from "./ExampleCallPreview.module.css";

type ExampleCallPreviewProps = {
  fixture: MundialFixture;
};

export default function ExampleCallPreview({ fixture }: ExampleCallPreviewProps) {
  const example = formatExampleReply(fixture.home, fixture.away);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const openReply = useCallback(async () => {
    setBusy(true);
    setHint(null);
    try {
      const post = await fetchMatchPost(fixture.id);
      const example = formatExampleReply(fixture.home, fixture.away);
      if (post.found && post.tweetId) {
        const url = buildReplyIntentUrl(post.tweetId, example);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      setHint(post.hint ?? "Match thread not live yet — check back closer to kickoff.");
    } catch {
      setHint("Could not open the match thread. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }, [fixture.id]);

  return (
    <div className={styles.wrap}>
      <p className={styles.label}>Example reply on X</p>
      <button
        type="button"
        className={styles.preview}
        onClick={() => void openReply()}
        disabled={busy}
      >
        <span className={styles.text}>{example}</span>
        <span className={styles.action}>{busy ? "Opening…" : "Tap to reply"}</span>
      </button>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
