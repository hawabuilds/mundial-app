"use client";



import { useConnectModal } from "@rainbow-me/rainbowkit";

import { useSession } from "next-auth/react";

import { useTranslations } from "next-intl";

import { DM_Mono, Outfit } from "next/font/google";

import { useCallback, useEffect, useRef, useState } from "react";

import { isWalletConnectConnector } from "../lib/isWalletConnect";
import { useAccount } from "wagmi";

import { bnbStr, usd } from "../data/rewards";

import type { ClaimableRewardDto } from "../lib/listUserClaimableRewards";

import { fetchClaimableRewards } from "../lib/claimable-rewards-client";

import { signInWithX } from "../lib/auth-client";

import { translateTierLabel } from "../lib/i18n-tiers";

import {
  clearPendingCelebration,
  pendingToShareCard,
  readPendingCelebration,
  savePendingCelebration,
  type PendingCelebration,
} from "../lib/claimCelebrationPending";
import { getPayoutExplorerTxUrl } from "../lib/payout-config-client";
import { useClaimOnChain } from "../lib/useClaimOnChain";

import { useLinkPayoutWallet } from "../lib/useLinkPayoutWallet";

import AppShell from "./AppShell";

import CelebrationCard, { type ShareCardData } from "./CelebrationCard";

import { TROPHY_SRC } from "./dashboard-assets/trophy";

import styles from "./Claim.module.css";

function markRewardClaimed(
  rewards: ClaimableRewardDto[],
  id: string,
  bnb: number,
): ClaimableRewardDto[] {
  return rewards.map((r) =>
    r.id === id ? { ...r, claimed: true, bnb } : r,
  );
}

function mergeClaimedRewards(
  prev: ClaimableRewardDto[],
  fresh: ClaimableRewardDto[],
): ClaimableRewardDto[] {
  const claimedById = new Map(
    prev.filter((r) => r.claimed).map((r) => [r.id, r] as const),
  );
  return fresh.map((r) => {
    const local = claimedById.get(r.id);
    if (!local) return r;
    return { ...r, claimed: true, bnb: local.bnb };
  });
}



const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
});



const dmMono = DM_Mono({

  subsets: ["latin"],

  weight: ["400", "500"],

  variable: "--font-dm-mono",

});



type ClaimProps = {

  onGoToDashboard: () => void;

  onGoToLeaderboard: () => void;

  onGoToWallet: () => void;

};



function CheckIcon() {

  return (

    <svg

      viewBox="0 0 24 24"

      fill="none"

      stroke="currentColor"

      strokeWidth="3"

      aria-hidden

    >

      <polyline points="20 6 9 17 4 12" />

    </svg>

  );

}



function TrophyImage({ dim }: { dim?: boolean }) {

  const tc = useTranslations("common");

  return (

    <div className={`${styles.ccTrophy} ${dim ? styles.ccTrophyDim : ""}`}>

      {/* eslint-disable-next-line @next/next/no-img-element */}

      <img className={styles.ccTrophyImg} src={TROPHY_SRC} alt={tc("trophyAlt")} />

    </div>

  );

}



export default function Claim({

  onGoToDashboard,

  onGoToLeaderboard,

  onGoToWallet,

}: ClaimProps) {

  const t = useTranslations("claim");

  const tc = useTranslations("common");

  const tt = useTranslations("tiers");

  const tCelebration = useTranslations("celebrationCard");

  const { status } = useSession();

  const { isConnected, connector } = useAccount();
  const isQrWallet = isWalletConnectConnector(
    connector?.id,
    connector?.name,
  );

  const { openConnectModal } = useConnectModal();

  const { linkStatus, linkError: walletLinkError } = useLinkPayoutWallet({
    showLinkedState: false,
  });

  const {
    claimEpoch,
    busy,
    reset: resetClaim,
    error: claimError,
  } = useClaimOnChain();



  const [rewards, setRewards] = useState<ClaimableRewardDto[]>([]);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);

  const [claimingId, setClaimingId] = useState<string | null>(null);

  const [claimingAll, setClaimingAll] = useState(false);

  const [celebration, setCelebration] = useState<ShareCardData | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [explorerLink, setExplorerLink] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  const reloadRewards = useCallback(async () => {
    const data = await fetchClaimableRewards();
    setRewards((prev) => mergeClaimedRewards(prev, data));
    return data;
  }, []);



  useEffect(() => {

    if (status !== "authenticated") {

      setRewards([]);

      setLoading(false);

      setLoadError(null);

      return;

    }



    let cancelled = false;

    setLoading(true);

    setLoadError(null);



    void fetchClaimableRewards()

      .then((data) => {

        if (!cancelled) setRewards(data);

      })

      .catch((err) => {

        if (!cancelled) {

          setLoadError(

            err instanceof Error ? err.message : "Failed to load rewards",

          );

        }

      })

      .finally(() => {

        if (!cancelled) setLoading(false);

      });



    return () => {

      cancelled = true;

    };

  }, [status]);

  const showToast = useCallback((msg: string, durationMs = 8000) => {

    if (toastTimer.current) clearTimeout(toastTimer.current);

    setToast(msg);

    toastTimer.current = setTimeout(() => setToast(null), durationMs);

  }, []);



  const claimable = rewards.filter((r) => !r.claimed);

  const history = rewards.filter((r) => r.claimed);

  const totalBnb = claimable.reduce((s, r) => s + r.bnb, 0);

  const isEmpty = !loading && rewards.length === 0;



  const closeCelebration = () => {
    clearPendingCelebration();
    setCelebration(null);
    showToast(t("toastClaimed"));
  };

  const translateRewardDay = (day: string) => {

    switch (day) {

      case "Today":

        return t("dayToday");

      case "Yesterday":

        return t("dayYesterday");

      case "Mon":

        return t("dayMon");

      case "Sun":

        return t("daySun");

      default:

        return day;

    }

  };



  const formatRankMeta = (reward: ClaimableRewardDto) =>

    tc("rankMeta", {

      rank: reward.rank,

      tier: translateTierLabel(tt, reward.tier),

      pts: reward.pts.toLocaleString(),

    });

  const showCelebrationForReward = useCallback(
    (
      reward: ClaimableRewardDto,
      bnb: number,
      extra?: Partial<PendingCelebration>,
    ) => {
      const payload: PendingCelebration = {
        epochId: reward.epochId,
        tier: reward.tier,
        day: translateRewardDay(reward.day),
        date: reward.date,
        bnb,
        ...extra,
      };
      savePendingCelebration(payload);
      setCelebration(pendingToShareCard(payload));
      resetClaim();
    },
    [resetClaim],
  );

  const tryRestorePendingCelebration = useCallback(
    (list: ClaimableRewardDto[]) => {
      const pending = readPendingCelebration();
      if (!pending || celebration !== null) return;

      const reward = list.find((r) => r.epochId === pending.epochId);
      if (!reward?.claimed && !pending.txHash) return;

      setCelebration(pendingToShareCard(pending));
      resetClaim();
      if (pending.txHash && pending.chainId) {
        setExplorerLink(
          getPayoutExplorerTxUrl(pending.chainId, pending.txHash as `0x${string}`),
        );
      }
    },
    [celebration, resetClaim],
  );

  useEffect(() => {
    if (status !== "authenticated" || loading) return;
    tryRestorePendingCelebration(rewards);
  }, [status, loading, rewards, tryRestorePendingCelebration]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void reloadRewards()
        .then((list) => tryRestorePendingCelebration(list))
        .catch(() => undefined);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status, reloadRewards, tryRestorePendingCelebration]);

  const ensureWallet = (): boolean => {

    if (isConnected) return true;

    if (openConnectModal) {

      openConnectModal();

    } else {

      onGoToWallet();

    }

    return false;

  };



  const runClaim = async (reward: ClaimableRewardDto) => {
    if (!ensureWallet()) return false;

    resetClaim();
    setClaimingId(reward.id);

    savePendingCelebration({
      epochId: reward.epochId,
      tier: reward.tier,
      day: translateRewardDay(reward.day),
      date: reward.date,
      bnb: reward.bnb,
    });

    const result = await claimEpoch(reward.epochId);
    setClaimingId(null);

    const claimedBnb = result.amountBnb ?? reward.bnb;
    const celebrationExtra: Partial<PendingCelebration> = {
      bnb: claimedBnb,
      ...(result.txHash && result.chainId
        ? { txHash: result.txHash, chainId: result.chainId }
        : {}),
    };

    if (!result.ok) {
      if (/already claimed|voucher used/i.test(result.error ?? "")) {
        setExplorerLink(null);
        setRewards((prev) => markRewardClaimed(prev, reward.id, claimedBnb));
        try {
          await reloadRewards();
        } catch {
          /* keep local claimed state */
        }
        showCelebrationForReward(reward, claimedBnb, celebrationExtra);
        return true;
      }

      setExplorerLink(null);
      showToast(result.error ?? t("claimFailed"), 12000);
      clearPendingCelebration();
      return false;
    }

    if (result.txHash && result.chainId) {
      setExplorerLink(
        getPayoutExplorerTxUrl(result.chainId, result.txHash),
      );
    }

    setRewards((prev) => markRewardClaimed(prev, reward.id, claimedBnb));

    try {
      await reloadRewards();
    } catch {
      /* keep local claimed state */
    }

    showCelebrationForReward(reward, claimedBnb, celebrationExtra);
    return true;
  };



  const claimDay = (id: string) => {

    const reward = rewards.find((x) => x.id === id);

    if (
      !reward ||
      reward.claimed ||
      claimingId ||
      claimingAll ||
      busy ||
      linkStatus === "linking"
    ) {
      return;
    }

    void runClaim(reward);

  };



  const claimAll = async () => {

    const pending = rewards.filter((r) => !r.claimed);

    if (!pending.length || claimingAll || claimingId || busy) return;

    if (!ensureWallet()) return;



    setClaimingAll(true);

    resetClaim();



    let claimedCount = 0;

    let lastReward: ClaimableRewardDto | null = null;

    let total = 0;

    const claimedLocally: { id: string; bnb: number }[] = [];

    for (const reward of pending) {
      setClaimingId(reward.id);

      const result = await claimEpoch(reward.epochId);

      if (!result.ok) {
        if (/already claimed|voucher used/i.test(result.error ?? "")) {
          claimedCount += 1;
          total += result.amountBnb ?? reward.bnb;
          lastReward = reward;
          claimedLocally.push({
            id: reward.id,
            bnb: result.amountBnb ?? reward.bnb,
          });
          continue;
        }
        showToast(result.error ?? t("claimFailed"));
        break;
      }

      claimedCount += 1;
      total += result.amountBnb ?? reward.bnb;
      lastReward = reward;
      claimedLocally.push({
        id: reward.id,
        bnb: result.amountBnb ?? reward.bnb,
      });
    }



    setClaimingId(null);

    setClaimingAll(false);



    if (claimedCount === 0) return;



    setRewards((prev) =>
      claimedLocally.reduce(
        (list, item) => markRewardClaimed(list, item.id, item.bnb),
        prev,
      ),
    );

    try {
      await reloadRewards();
    } catch {
      /* keep local claimed state */
    }



    if (lastReward) {
      const multi = claimedCount > 1 ? claimedCount : undefined;
      showCelebrationForReward(lastReward, total, {
        day: multi
          ? tc("multiDays", { count: claimedCount })
          : translateRewardDay(lastReward.day),
        date: multi ? "" : lastReward.date,
        multi,
      });
    }
  };



  const renderBody = () => {

    if (status === "unauthenticated") {

      return (

        <div className={styles.claimEmpty}>

          <div className={styles.ceTitle}>{t("signInTitle")}</div>

          <p className={styles.ceSub}>{t("signInSub")}</p>

          <button

            type="button"

            className={`${styles.btn} ${styles.btnGreen} ${styles.emptyBtn}`}

            onClick={() => signInWithX()}

          >

            {t("signInButton")}

          </button>

        </div>

      );

    }

    if (status === "loading" || loading) {

      return (

        <div className={styles.claimEmpty}>

          <p className={styles.ceSub}>{t("loadingRewards")}</p>

        </div>

      );

    }



    if (loadError) {

      return (

        <div className={styles.claimEmpty}>

          <div className={styles.ceTitle}>{t("loadFailedTitle")}</div>

          <p className={styles.claimError}>{loadError}</p>

          <button

            type="button"

            className={`${styles.btn} ${styles.btnGreen} ${styles.emptyBtn}`}

            onClick={() => {

              setLoading(true);

              void reloadRewards()

                .catch((err) =>

                  setLoadError(

                    err instanceof Error ? err.message : "Failed to load rewards",

                  ),

                )

                .finally(() => setLoading(false));

            }}

          >

            {t("retry")}

          </button>

        </div>

      );

    }



    if (isEmpty) {

      return (

        <div className={styles.claimEmpty}>

          <div className={styles.ceTitle}>{t("emptyTitle")}</div>

          <p className={styles.ceSub}>{t("emptySub")}</p>

          <button

            type="button"

            className={`${styles.btn} ${styles.btnGreen} ${styles.emptyBtn}`}

            onClick={onGoToDashboard}

          >

            {t("makePrediction")}

          </button>

        </div>

      );

    }



    return (

      <>

        {walletLinkError ? (

          <p className={styles.claimError} role="alert">

            {walletLinkError}

          </p>

        ) : null}



        {linkStatus === "linking" ? (

          <p className={styles.claimNotice} role="status">

            {t("linkingWallet")}

          </p>

        ) : null}



        {claimError ? (

          <p className={styles.claimError} role="alert">

            {claimError}

          </p>

        ) : null}



        {claimable.length > 0 && isConnected && isQrWallet ? (

          <p className={styles.claimWcBanner} role="status">

            {busy ? t("claimWcBusy") : t("claimWcHint")}

          </p>

        ) : null}



        {explorerLink ? (

          <a

            className={styles.claimExplorerLink}

            href={explorerLink}

            target="_blank"

            rel="noopener noreferrer"

          >

            {t("viewOnBscScan")}

          </a>

        ) : null}



        {claimable.length > 0 && (

          <div className={styles.claimSummary}>

            <div className={styles.csLbl}>{t("totalReady")}</div>

            <div className={styles.csAmount}>

              {bnbStr(totalBnb)}{" "}

              <span className={styles.csUnit}>{tc("bnb")}</span>

            </div>

            <div className={styles.csUsd}>

              {tc("approxUsd", { amount: usd(totalBnb) })}

              {claimable.length > 1

                ? ` · ${tc("rewardDays", { count: claimable.length })}`

                : ""}

            </div>

            {claimable.length > 1 && (

              <button

                type="button"

                className={`${styles.btn} ${styles.btnGreen} ${styles.csClaimAll}`}

                onClick={() => void claimAll()}

                disabled={claimingAll || claimingId !== null || busy}

              >

                {claimingAll || busy

                  ? tc("sending")

                  : tc("claimAll", { count: claimable.length })}

              </button>

            )}

          </div>

        )}



        {claimable.length > 0 && (

          <>

            <div className={styles.claimSecHead}>

              <span>{t("readyToClaim")}</span>

              <span className={styles.cshCount}>{claimable.length}</span>

            </div>

            <div className={styles.claimList}>

              {claimable.map((r) => (

                <div key={r.id} className={styles.claimCard}>

                  <TrophyImage />

                  <div className={styles.ccMid}>

                    <div className={styles.ccDay}>

                      {tc("dayDate", {

                        day: translateRewardDay(r.day),

                        date: r.date,

                      })}

                    </div>

                    <div className={styles.ccMeta}>{formatRankMeta(r)}</div>

                  </div>

                  <div className={styles.ccRight}>

                    <div className={styles.ccAmt}>

                      {bnbStr(r.bnb)}{" "}

                      <span className={styles.ccUnit}>{tc("bnb")}</span>

                    </div>

                    <div className={styles.ccUsd}>

                      {tc("approxUsdInline", { amount: usd(r.bnb) })}

                    </div>

                    <button

                      type="button"

                      className={styles.ccBtn}

                      onClick={() => claimDay(r.id)}

                      disabled={

                        claimingId === r.id ||

                        claimingAll ||

                        busy ||

                        (claimingId !== null && claimingId !== r.id)

                      }

                    >

                      {claimingId === r.id || busy ? tc("sending") : t("claim")}

                    </button>

                  </div>

                </div>

              ))}

            </div>

          </>

        )}



        {history.length > 0 && (

          <>

            <div className={styles.claimSecHead}>

              <span>{t("claimHistory")}</span>

            </div>

            <div className={styles.claimList}>

              {history.map((r) => (

                <div

                  key={r.id}

                  className={`${styles.claimCard} ${styles.claimCardClaimed}`}

                >

                  <TrophyImage dim />

                  <div className={styles.ccMid}>

                    <div className={styles.ccDay}>

                      {tc("dayDate", {

                        day: translateRewardDay(r.day),

                        date: r.date,

                      })}

                    </div>

                    <div className={styles.ccMeta}>{formatRankMeta(r)}</div>

                  </div>

                  <div className={styles.ccRight}>

                    <div className={styles.ccAmt}>

                      {bnbStr(r.bnb)}{" "}

                      <span className={styles.ccUnit}>{tc("bnb")}</span>

                    </div>

                    <div className={styles.ccUsd}>

                      {tc("approxUsdInline", { amount: usd(r.bnb) })}

                    </div>

                    <div className={styles.ccStatus}>

                      <CheckIcon />

                      {tc("claimedOn", { date: r.date })}

                    </div>

                  </div>

                </div>

              ))}

            </div>

          </>

        )}

      </>

    );

  };



  return (

    <div

      id="s-claim"

      className={`${styles.root} ${outfit.variable} ${dmMono.variable}`}

    >

      <AppShell
        activeTab="claim"
        onHome={onGoToDashboard}
        onRanks={onGoToLeaderboard}
        onWallet={onGoToWallet}
        onClaim={() => {}}
        claimHighlight={claimable.length > 0}
      >

          <div className={styles.body}>{renderBody()}</div>

      </AppShell>



        <div

          className={`${styles.toast}${toast ? ` ${styles.toastShow}` : ""}`}

          role="status"

          aria-live="polite"

        >

          {toast ?? ""}

        </div>



        <CelebrationCard

          open={celebration !== null}

          data={celebration}

          onClose={closeCelebration}

          onShareFallback={({ imageCopied }) =>
            showToast(
              imageCopied
                ? tCelebration("sharePasteHint")
                : t("toastOpeningX"),
            )
          }

        />

    </div>

  );

}


