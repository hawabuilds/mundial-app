"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DM_Mono, Figtree } from "next/font/google";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { signInWithX } from "../lib/auth-client";
import {
  claimBounty,
  createBountyRequest,
  fetchBounties,
  selectBountyWinner,
  submitBountyEntry,
  uploadBountyImage,
  uploadBountyVideo,
  type ApiBounty,
} from "../lib/bounty-client";
import { BSC_TESTNET_CHAIN_ID, PAYOUT_CHAIN_ID } from "../lib/payoutConfig";
import { bnbStr, usd } from "../data/rewards";
import NavUserControl from "../components/NavUserControl";
import NavWalletControl from "../components/NavWalletControl";
import SiteFooter from "../components/SiteFooter";
import styles from "./Bounty.module.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-figtree",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

function rewardBnbOf(bounty: ApiBounty): number {
  try {
    return Number(BigInt(bounty.rewardWei)) / 1e18;
  } catch {
    return 0;
  }
}

function isImageMediaUrl(url: string): boolean {
  try {
    return /\.(jpe?g|png|webp|gif|svg)$/i.test(new URL(url).pathname);
  } catch {
    return /\.(jpe?g|png|webp|gif|svg)$/i.test(url);
  }
}

function txExplorerUrl(txHash: string): string {
  const base =
    PAYOUT_CHAIN_ID === BSC_TESTNET_CHAIN_ID
      ? "https://testnet.bscscan.com"
      : "https://bscscan.com";
  return `${base}/tx/${txHash}`;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

type BountyStatus = "open" | "judging" | "won" | "paid";
type FilterTab = "all" | "live" | "judging" | "completed";

function bountyStatus(bounty: ApiBounty, now: number): BountyStatus {
  if (bounty.paidTxHash) return "paid";
  if (bounty.winnerSelectedAt) return "won";
  if (new Date(bounty.deadlineAt).getTime() > now) return "open";
  return "judging";
}

function tabOf(status: BountyStatus): FilterTab {
  if (status === "open") return "live";
  if (status === "paid") return "completed";
  return "judging";
}

function AdminCreateForm({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("bounty");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [rewardBnb, setRewardBnb] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const reward = Number(rewardBnb);
    const deadlineDate = deadline ? new Date(deadline) : null;
    if (!title.trim() || !description.trim()) {
      setError(t("adminErrorFields"));
      return;
    }
    if (!image) {
      setError(t("adminErrorImage"));
      return;
    }
    if (!Number.isFinite(reward) || reward <= 0) {
      setError(t("adminErrorReward"));
      return;
    }
    if (!deadlineDate || deadlineDate.getTime() <= Date.now()) {
      setError(t("adminErrorDeadline"));
      return;
    }

    try {
      setBusyLabel(t("adminUploadingImage"));
      const imagePath = await uploadBountyImage(image);

      setBusyLabel(t("adminCreating"));
      await createBountyRequest({
        title: title.trim(),
        description: description.trim(),
        imagePath,
        rewardBnb: reward,
        deadlineAt: deadlineDate.toISOString(),
      });
      setTitle("");
      setDescription("");
      setImage(null);
      setImageInputKey((key) => key + 1);
      setRewardBnb("");
      setDeadline("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusyLabel(null);
    }
  };

  return (
    <form className={styles.adminCard} onSubmit={handleSubmit}>
      <div className={styles.adminLabel}>{t("adminNewBounty")}</div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("adminTitle")}</label>
        <input
          className={styles.input}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("adminDescription")}</label>
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("adminImage")}</label>
        <input
          key={imageInputKey}
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
        {image ? (
          <img
            className={styles.adminImagePreview}
            src={URL.createObjectURL(image)}
            alt=""
          />
        ) : null}
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t("adminReward")}</label>
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.0001"
            value={rewardBnb}
            onChange={(event) => setRewardBnb(event.target.value)}
            placeholder="0.1"
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>{t("adminDeadline")}</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
      </div>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <button
        type="submit"
        className={`${styles.btn} ${styles.btnGreen}`}
        disabled={busyLabel !== null}
      >
        {busyLabel ?? t("adminCreate")}
      </button>
    </form>
  );
}

function SubmitEntryForm({
  bounty,
  onSubmitted,
}: {
  bounty: ApiBounty;
  onSubmitted: () => void;
}) {
  const t = useTranslations("bounty");
  const [file, setFile] = useState<File | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasMine = bounty.submissions.some((submission) => submission.isMine);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!file) {
      setError(t("submitErrorVideo"));
      return;
    }
    if (!postUrl.trim()) {
      setError(t("submitErrorPost"));
      return;
    }

    try {
      const videoPath = await uploadBountyVideo(bounty.id, file, (phase) =>
        setBusyLabel(phase === "signing" ? t("submitPreparing") : t("submitUploading")),
      );
      setBusyLabel(t("submitSaving"));
      await submitBountyEntry({
        bountyId: bounty.id,
        videoPath,
        socialPostUrl: postUrl.trim(),
      });
      setDone(true);
      setFile(null);
      setPostUrl("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusyLabel(null);
    }
  };

  return (
    <form className={styles.section} onSubmit={handleSubmit}>
      <div className={styles.sectionLabel}>
        {hasMine ? t("submitTitleAgain") : t("submitTitle")}
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("submitVideoLabel")}</label>
        <input
          className={styles.fileInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>{t("submitPostLabel")}</label>
        <input
          className={styles.input}
          type="url"
          inputMode="url"
          placeholder="https://x.com/yourhandle/status/…"
          value={postUrl}
          onChange={(event) => setPostUrl(event.target.value)}
        />
      </div>
      <div className={styles.hint}>{t("submitHint")}</div>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {done ? <div className={styles.successNote}>{t("submitDone")}</div> : null}
      <button
        type="submit"
        className={`${styles.btn} ${styles.btnWhite}`}
        disabled={busyLabel !== null}
      >
        {busyLabel ?? (hasMine ? t("submitButtonAgain") : t("submitButton"))}
      </button>
    </form>
  );
}

function ClaimCard({
  bounty,
  onClaimed,
}: {
  bounty: ApiBounty;
  onClaimed: () => void;
}) {
  const t = useTranslations("bounty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(bounty.paidTxHash);

  const amount = rewardBnbOf(bounty);

  const handleClaim = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await claimBounty(bounty.id);
      if (result.txHash) setTxHash(result.txHash);
      onClaimed();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.claimCard}>
      <div className={styles.claimTitle}>{t("claimTitle")}</div>
      <div className={styles.claimText}>
        {t("claimText", { amount: bnbStr(amount), usd: usd(amount) })}
      </div>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      {txHash ? (
        <a
          href={txExplorerUrl(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.txLink}
        >
          {t("claimViewTx")}
        </a>
      ) : (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGreen}`}
          onClick={handleClaim}
          disabled={busy}
        >
          {busy ? t("claimSending") : t("claimButton", { amount: bnbStr(amount) })}
        </button>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: BountyStatus }) {
  const t = useTranslations("bounty");
  const statusLabel = {
    open: t("statusOpen"),
    judging: t("statusJudging"),
    won: t("statusWon"),
    paid: t("statusPaid"),
  }[status];

  return (
    <span
      className={`${styles.statusChip} ${
        status === "open" ? styles.statusOpen : ""
      } ${status === "paid" ? styles.statusPaid : ""}`}
    >
      {statusLabel}
    </span>
  );
}

function BountyGridCard({
  bounty,
  now,
  onOpen,
}: {
  bounty: ApiBounty;
  now: number;
  onOpen: () => void;
}) {
  const t = useTranslations("bounty");
  const status = bountyStatus(bounty, now);
  const deadlineMs = new Date(bounty.deadlineAt).getTime();
  const amount = rewardBnbOf(bounty);

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      {bounty.imageUrl ? (
        <img
          className={styles.cardCover}
          src={bounty.imageUrl}
          alt=""
          loading="lazy"
        />
      ) : null}
      <div className={styles.cardTop}>
        <StatusChip status={status} />
        <span
          className={`${styles.cardCountdown} ${
            status === "open" ? "" : styles.cardCountdownClosed
          }`}
        >
          {status === "open"
            ? formatRemaining(deadlineMs - now)
            : t("submissionsClosed")}
        </span>
      </div>
      <h2 className={styles.cardTitle}>{bounty.title}</h2>
      <p className={styles.cardDesc}>{bounty.description}</p>
      <div className={styles.cardFoot}>
        <div className={styles.cardReward}>
          <span className={styles.cardRewardValue}>{bnbStr(amount)} BNB</span>
          <span className={styles.cardRewardUsd}>{usd(amount)}</span>
        </div>
        {bounty.myCanClaim ? (
          <span className={styles.cardClaimHint}>{t("statusWon")}</span>
        ) : (
          <span className={styles.cardEntries}>
            {t("entriesCount", { count: bounty.submissions.length })}
          </span>
        )}
      </div>
    </button>
  );
}

function BountyDetail({
  bounty,
  isAdmin,
  signedIn,
  now,
  onChanged,
  onClose,
}: {
  bounty: ApiBounty;
  isAdmin: boolean;
  signedIn: boolean;
  now: number;
  onChanged: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("bounty");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  const status = bountyStatus(bounty, now);
  const deadlineMs = new Date(bounty.deadlineAt).getTime();
  const amount = rewardBnbOf(bounty);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelectWinner = async (submissionId: string) => {
    setSelectingId(submissionId);
    setSelectError(null);
    try {
      await selectBountyWinner({ bountyId: bounty.id, submissionId });
      onChanged();
    } catch (err) {
      setSelectError(err instanceof Error ? err.message : t("genericError"));
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className={styles.detail}>
        {bounty.imageUrl ? (
          <img className={styles.detailCover} src={bounty.imageUrl} alt="" />
        ) : null}
        <div className={styles.detailHead}>
          <div className={styles.detailTopRow}>
            <StatusChip status={status} />
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t("closeDetail")}
            >
              ✕
            </button>
          </div>
          <h2 className={styles.detailTitle}>{bounty.title}</h2>
          <p className={styles.bountyDesc}>{bounty.description}</p>
        </div>

        <div className={styles.bountyMetaRow}>
          <div className={styles.reward}>
            <span className={styles.rewardLabel}>{t("rewardLabel")}</span>
            <span className={styles.rewardValue}>
              {bnbStr(amount)} BNB · {usd(amount)}
            </span>
          </div>
          <div className={styles.countdown}>
            <span className={styles.countdownLabel}>
              {status === "open" ? t("endsIn") : t("deadlineLabel")}
            </span>
            <span
              className={`${styles.countdownValue} ${
                status === "open" ? "" : styles.countdownClosed
              }`}
            >
              {status === "open"
                ? formatRemaining(deadlineMs - now)
                : t("submissionsClosed")}
            </span>
          </div>
        </div>

        {bounty.myCanClaim ? (
          <ClaimCard bounty={bounty} onClaimed={onChanged} />
        ) : null}

        <div className={styles.section}>
          <div className={styles.sectionLabel}>
            {t("submissionsTitle", { count: bounty.submissions.length })}
          </div>
          {bounty.submissions.length === 0 ? (
            <div className={styles.hint}>{t("noSubmissions")}</div>
          ) : (
            bounty.submissions.map((submission) => (
              <div
                key={submission.id}
                className={`${styles.submission} ${
                  submission.isWinner ? styles.submissionWinner : ""
                }`}
              >
                <div className={styles.submissionHead}>
                  <span className={styles.submissionHandle}>
                    {submission.userHandle}
                  </span>
                  {submission.isWinner ? (
                    <span className={styles.winnerBadge}>{t("winnerBadge")}</span>
                  ) : submission.isMine ? (
                    <span className={styles.mineBadge}>{t("mineBadge")}</span>
                  ) : null}
                </div>
                {isImageMediaUrl(submission.videoUrl) ? (
                  <img
                    className={styles.video}
                    src={submission.videoUrl}
                    alt=""
                  />
                ) : (
                  <video
                    className={styles.video}
                    src={submission.videoUrl}
                    controls
                    preload="metadata"
                    playsInline
                  />
                )}
                <a
                  href={submission.socialPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.postLink}
                >
                  {t("viewPost")}
                </a>
                {isAdmin && status === "judging" ? (
                  <button
                    type="button"
                    className={styles.selectWinnerBtn}
                    onClick={() => handleSelectWinner(submission.id)}
                    disabled={selectingId !== null}
                  >
                    {selectingId === submission.id
                      ? t("selectingWinner")
                      : t("selectWinner")}
                  </button>
                ) : null}
              </div>
            ))
          )}
          {selectError ? (
            <div className={styles.errorBanner}>{selectError}</div>
          ) : null}
        </div>

        {status === "open" && signedIn ? (
          <SubmitEntryForm bounty={bounty} onSubmitted={onChanged} />
        ) : null}
      </article>
    </div>
  );
}

export default function BountyPage() {
  const t = useTranslations("bounty");
  const { status: sessionStatus } = useSession();
  const signedIn = sessionStatus === "authenticated";

  const [bounties, setBounties] = useState<ApiBounty[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<FilterTab>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    fetchBounties()
      .then((data) => {
        setBounties(data.bounties);
        setIsAdmin(data.isAdmin);
        setLoadError(null);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(id);
  }, [refresh, sessionStatus]);

  const stats = useMemo(() => {
    let live = 0;
    let submissions = 0;
    let unclaimedWei = 0n;
    for (const bounty of bounties) {
      const status = bountyStatus(bounty, now);
      if (status === "open") live += 1;
      submissions += bounty.submissions.length;
      if (!bounty.paidTxHash) {
        try {
          unclaimedWei += BigInt(bounty.rewardWei);
        } catch {
          // ignore malformed reward
        }
      }
    }
    const unclaimedBnb = Number(unclaimedWei) / 1e18;
    return { live, submissions, unclaimedBnb };
  }, [bounties, now]);

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: bounties.length,
      live: 0,
      judging: 0,
      completed: 0,
    };
    for (const bounty of bounties) {
      counts[tabOf(bountyStatus(bounty, now))] += 1;
    }
    return counts;
  }, [bounties, now]);

  const visible = useMemo(() => {
    const rank = (bounty: ApiBounty) =>
      bountyStatus(bounty, now) === "open" ? 0 : 1;
    return [...bounties]
      .filter(
        (bounty) => tab === "all" || tabOf(bountyStatus(bounty, now)) === tab,
      )
      .sort(
        (a, b) =>
          rank(a) - rank(b) ||
          new Date(b.deadlineAt).getTime() - new Date(a.deadlineAt).getTime(),
      );
  }, [bounties, now, tab]);

  const openBounty = openId
    ? bounties.find((bounty) => bounty.id === openId) ?? null
    : null;

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: t("tabAll") },
    { id: "live", label: t("tabLive") },
    { id: "judging", label: t("tabJudging") },
    { id: "completed", label: t("tabCompleted") },
  ];

  return (
    <div className={`${styles.root} ${figtree.variable} ${dmMono.variable}`}>
      <div className={styles.app}>
        <header className={styles.nav}>
          <Link href="/" className={styles.back}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t("backHome")}
          </Link>
          <div className={styles.navRight}>
            {signedIn ? (
              <NavUserControl />
            ) : sessionStatus !== "loading" ? (
              <button
                type="button"
                className={styles.navSignInBtn}
                onClick={() => void signInWithX()}
              >
                {t("signIn")}
              </button>
            ) : null}
            <NavWalletControl />
          </div>
        </header>

        <main className={styles.main}>
          <h1 className={styles.pageTitle}>{t("pageTitle")}</h1>
          <p className={styles.pageSub}>{t("pageSub")}</p>

          <div className={styles.statsBar}>
            <div className={styles.statCell}>
              <span className={`${styles.statValue} ${styles.statValueGreen}`}>
                {stats.live}
              </span>
              <span className={styles.statLabel}>{t("statsLive")}</span>
            </div>
            <div className={styles.statCell}>
              <span className={styles.statValue}>{stats.submissions}</span>
              <span className={styles.statLabel}>{t("statsSubmissions")}</span>
            </div>
            <div className={styles.statCell}>
              <span className={`${styles.statValue} ${styles.statValueGreen}`}>
                {bnbStr(stats.unclaimedBnb)} BNB
              </span>
              <span className={styles.statLabel}>{t("statsUnclaimed")}</span>
            </div>
          </div>

          {isAdmin ? <AdminCreateForm onCreated={refresh} /> : null}

          {loadError ? (
            <div className={styles.errorBanner}>{loadError}</div>
          ) : null}

          <div className={styles.tabs}>
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`${styles.tab} ${
                  tab === entry.id ? styles.tabActive : ""
                }`}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
                <span className={styles.tabCount}>{tabCounts[entry.id]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className={styles.loading}>{t("loading")}</div>
          ) : visible.length === 0 ? (
            <div className={styles.empty}>
              {bounties.length === 0 ? t("noBounties") : t("noBountiesFiltered")}
            </div>
          ) : (
            <div className={styles.grid}>
              {visible.map((bounty) => (
                <BountyGridCard
                  key={bounty.id}
                  bounty={bounty}
                  now={now}
                  onOpen={() => setOpenId(bounty.id)}
                />
              ))}
            </div>
          )}
        </main>

        <SiteFooter />
      </div>

      {openBounty ? (
        <BountyDetail
          bounty={openBounty}
          isAdmin={isAdmin}
          signedIn={signedIn}
          now={now}
          onChanged={refresh}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}
