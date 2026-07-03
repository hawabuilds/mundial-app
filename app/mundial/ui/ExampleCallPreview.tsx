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
  const [notPostedYet, setNotPostedYet] = useState(false);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const openReply = useCallback(async () => {
    setBusy(true);
    setNotPostedYet(false);
    setErrorHint(null);
    try {
      const post = await fetchMatchPost(fixture.id, {
        home: fixture.home,
        away: fixture.away,
        date: fixture.date,
        time: fixture.time,
      });
      const example = formatExampleReply(fixture.home, fixture.away);
      if (post.found && post.tweetId) {
        const url = buildReplyIntentUrl(post.tweetId, example);
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      setNotPostedYet(true);
    } catch {
      setErrorHint("Could not open the match thread. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }, [fixture.home, fixture.away, fixture.id, fixture.date, fixture.time]);

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
      {notPostedYet ? (
        <p className={styles.hint}>
          This match post has not been posted yet. Follow{" "}
          <a
            href="https://x.com/copamundialapp"
            className={styles.hintLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            @copamundialapp
          </a>{" "}
          on X to keep an eye out.
        </p>
      ) : null}
      {errorHint ? <p className={styles.hint}>{errorHint}</p> : null}
    </div>
  );
}
