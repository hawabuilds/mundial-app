"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MundialFixture, MundialGoal } from "../lib/fixtures";
import { settledOnRegulationScore } from "../lib/fixtures";
import { mergePenaltyShootout } from "@/lib/penaltyShootout";
import { useLocalKickoff } from "../lib/kickoff";
import Card from "./Card";
import ExampleCallPreview from "./ExampleCallPreview";
import Flag from "./Flag";
import MarketOddsLine from "./MarketOddsLine";
import TxLineProofPopover from "./TxLineProofPopover";
import { goalScorerDisplayName } from "@/lib/playerDisplayName";
import type { GoalCelebration } from "../ui/goalCelebration";
import {
  GOAL_CARD_MOMENT_MS,
  GOAL_SCORE_REVEAL_MS,
  GOAL_SCORER_WAIT_MS,
  goalCelebrationTimingStyle,
} from "./goalCelebration";
import PenaltyKickMarks, { penaltyKickKey } from "./PenaltyKickMarks";
import styles from "./FixtureCard.module.css";

type FixtureCardProps = {
  fixture: MundialFixture;
  featured?: boolean;
  /** Show the "tap to reply" example (upcoming matches only). */
  withReply?: boolean;
  /** Show TxLINE market odds (must be set explicitly for the current match only). */
  showMarketOdds?: boolean;
  /** Active premium goal moment — featured card only. */
  celebration?: GoalCelebration | null;
};

function fixtureInPlay(fixture: MundialFixture): boolean {
  if (fixture.phase === "live") return true;
  const status = fixture.status;
  return (
    status === "LIVE" ||
    status === "HT" ||
    status === "1H" ||
    status === "2H" ||
    status === "ET" ||
    status === "P"
  );
}

type GroupedScorer = {
  side: "home" | "away";
  player: string | null;
  playerShort: string | null;
  ownGoal: boolean;
  penalty: boolean;
  minutes: number[];
};

function groupScorersByPlayer(goals: MundialGoal[]): GroupedScorer[] {
  const rows: GroupedScorer[] = [];
  const byPlayer = new Map<string, GroupedScorer>();

  for (const goal of goals) {
    if (!goal.player) {
      rows.push({
        side: goal.side,
        player: null,
        playerShort: null,
        ownGoal: goal.ownGoal,
        penalty: goal.penalty,
        minutes: goal.minute != null ? [goal.minute] : [],
      });
      continue;
    }

    const key = `${goal.player}|${goal.ownGoal ? 1 : 0}|${goal.penalty ? 1 : 0}`;
    let row = byPlayer.get(key);
    if (!row) {
      row = {
        side: goal.side,
        player: goal.player,
        playerShort: goal.playerShort,
        ownGoal: goal.ownGoal,
        penalty: goal.penalty,
        minutes: [],
      };
      byPlayer.set(key, row);
      rows.push(row);
    }
    if (goal.minute != null && !row.minutes.includes(goal.minute)) {
      row.minutes.push(goal.minute);
    }
  }

  for (const row of rows) {
    row.minutes.sort((a, b) => a - b);
  }
  return rows;
}

function formatGoalMinutes(minutes: number[]): string {
  return minutes.map((m) => `${m}\u2019`).join(", ");
}

function scorerDisplayName(row: Pick<GroupedScorer, "player" | "playerShort">): string | null {
  return goalScorerDisplayName(row);
}

function isCelebrationGoal(goal: MundialGoal, event: GoalCelebration): boolean {
  if (goal.side !== event.side) return false;
  if (event.minute != null && goal.minute === event.minute) return true;
  if (event.player) {
    return (
      goal.player === event.player ||
      goalScorerDisplayName(goal) === event.player
    );
  }
  return false;
}

function enrichGoalFromCelebration(
  goal: MundialGoal,
  event: GoalCelebration,
): MundialGoal {
  return {
    ...goal,
    minute: goal.minute ?? event.minute,
    player: goal.player ?? event.player,
    playerShort: goal.playerShort ?? event.player,
    ownGoal: goal.ownGoal || event.ownGoal,
    penalty: goal.penalty || event.penalty,
  };
}

function celebrationGoalDisplayName(
  goal: MundialGoal,
  event: GoalCelebration,
): string | null {
  return goalScorerDisplayName(enrichGoalFromCelebration(goal, event));
}

function resolveCelebrationDetails(
  event: GoalCelebration,
  goals: MundialGoal[],
): {
  player: string | null;
  minute: number | null;
  penalty: boolean;
  ownGoal: boolean;
} {
  const matched =
    goals.find((goal) => isCelebrationGoal(goal, event)) ??
    goals.filter((goal) => goal.side === event.side).at(-1) ??
    null;
  return {
    player:
      event.player ?? (matched ? goalScorerDisplayName(matched) : null),
    minute: event.minute ?? matched?.minute ?? null,
    penalty: event.penalty || (matched?.penalty ?? false),
    ownGoal: event.ownGoal || (matched?.ownGoal ?? false),
  };
}

function celebrationFlashKey(
  side: "home" | "away",
  minute: number | null,
  player: string,
): string {
  return `${side}-${minute ?? "goal"}-${player}`;
}

function goalsDuringCelebration(
  goals: MundialGoal[],
  event: GoalCelebration | null,
  hidePending: boolean,
): MundialGoal[] {
  if (!event) return goals;

  const filtered = goals
    .filter((goal) => {
      if (!isCelebrationGoal(goal, event)) return true;
      if (hidePending) return false;
      return celebrationGoalDisplayName(goal, event) != null;
    })
    .map((goal) =>
      isCelebrationGoal(goal, event) ? enrichGoalFromCelebration(goal, event) : goal,
    );

  if (hidePending) return filtered;

  const details = resolveCelebrationDetails(event, goals);
  if (!details.player && details.minute == null) return filtered;
  if (filtered.some((goal) => isCelebrationGoal(goal, event))) {
    return filtered.map((goal) =>
      isCelebrationGoal(goal, event)
        ? {
            ...enrichGoalFromCelebration(goal, event),
            penalty: goal.penalty || details.penalty,
            ownGoal: goal.ownGoal || details.ownGoal,
            minute: goal.minute ?? details.minute,
            player: goal.player ?? details.player,
            playerShort: goal.playerShort ?? details.player,
          }
        : goal,
    );
  }

  return [
    ...filtered,
    {
      side: event.side,
      minute: details.minute,
      player: details.player,
      playerShort: details.player,
      ownGoal: details.ownGoal,
      penalty: details.penalty,
    },
  ];
}

export default function FixtureCard({
  fixture,
  featured = false,
  withReply = false,
  showMarketOdds = false,
  celebration = null,
}: FixtureCardProps) {
  const { line: kickoffLine } = useLocalKickoff(
    fixture.date,
    fixture.time,
    fixture.kickoffUtcMs,
  );
  const prevGoalCount = useRef(fixture.goals.length);
  const prevHomeScore = useRef(fixture.homeScore ?? 0);
  const prevAwayScore = useRef(fixture.awayScore ?? 0);
  const hadCelebrationRef = useRef(false);
  const stableShootoutRef = useRef<ReturnType<typeof mergePenaltyShootout>>(null);
  const prevPenaltyKickKeysRef = useRef<Set<string>>(new Set());
  const pensInitializedRef = useRef(false);

  const [revealedPenaltyKickKeys, setRevealedPenaltyKickKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [penNameFlashKeys, setPenNameFlashKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    stableShootoutRef.current = null;
    prevPenaltyKickKeysRef.current = new Set();
    pensInitializedRef.current = false;
    setRevealedPenaltyKickKeys(new Set());
    setPenNameFlashKeys(new Set());
  }, [fixture.id]);

  const displayShootout = useMemo(() => {
    const incoming = fixture.penaltyShootout;
    if (!incoming) return stableShootoutRef.current;
    const merged = mergePenaltyShootout(stableShootoutRef.current, incoming);
    stableShootoutRef.current = merged;
    return merged;
  }, [fixture.penaltyShootout]);

  const inPenalties =
    fixture.status === "P" || displayShootout?.inProgress === true;

  const [newGoalKey, setNewGoalKey] = useState<string | null>(null);
  const [scorePop, setScorePop] = useState(false);
  const [scoreRevealed, setScoreRevealed] = useState(false);
  const [scoringSide, setScoringSide] = useState<"home" | "away" | null>(null);
  const [cardMoment, setCardMoment] = useState(false);
  const [revealTick, setRevealTick] = useState(0);
  const scoreRevealDoneRef = useRef(false);
  const revealReadyAtRef = useRef(0);
  const revealDeadlineRef = useRef(0);

  const activeCelebration =
    featured &&
    celebration != null &&
    celebration.matchId === fixture.id
      ? celebration
      : null;

  useEffect(() => {
    const homeScore = fixture.homeScore ?? 0;
    const awayScore = fixture.awayScore ?? 0;

    if (inPenalties) {
      prevGoalCount.current = fixture.goals.length;
      prevHomeScore.current = homeScore;
      prevAwayScore.current = awayScore;
      return;
    }

    const goalsIncreased = fixture.goals.length > prevGoalCount.current;
    const scoreIncreased =
      homeScore > prevHomeScore.current || awayScore > prevAwayScore.current;

    if (!goalsIncreased && !scoreIncreased) {
      prevGoalCount.current = fixture.goals.length;
      prevHomeScore.current = homeScore;
      prevAwayScore.current = awayScore;
      return;
    }

    if (activeCelebration) {
      prevGoalCount.current = fixture.goals.length;
      prevHomeScore.current = homeScore;
      prevAwayScore.current = awayScore;
      return;
    }

    // Featured card: goal overlay drives score hold + reveal — skip local pop.
    if (featured) {
      if (!goalsIncreased && !scoreIncreased) {
        prevGoalCount.current = fixture.goals.length;
        prevHomeScore.current = homeScore;
        prevAwayScore.current = awayScore;
      }
      return;
    }

    const latest = fixture.goals[fixture.goals.length - 1];
    if (latest) {
      const label = goalScorerDisplayName(latest) ?? "Goal";
      setNewGoalKey(
        celebrationFlashKey(latest.side, latest.minute, label),
      );
      setScoringSide(latest.side);
    } else if (homeScore > prevHomeScore.current) {
      setScoringSide("home");
    } else if (awayScore > prevAwayScore.current) {
      setScoringSide("away");
    }
    setScorePop(true);
    if (featured) {
      setCardMoment(true);
    }

    prevGoalCount.current = fixture.goals.length;
    prevHomeScore.current = homeScore;
    prevAwayScore.current = awayScore;
  }, [
    fixture.goals,
    fixture.homeScore,
    fixture.awayScore,
    featured,
    activeCelebration?.key,
    inPenalties,
  ]);

  useLayoutEffect(() => {
    if (!activeCelebration) {
      if (hadCelebrationRef.current) {
        hadCelebrationRef.current = false;
        scoreRevealDoneRef.current = false;
        setScorePop(false);
        setScoreRevealed(false);
        setNewGoalKey(null);
        setCardMoment(false);
      }
      return;
    }

    hadCelebrationRef.current = true;
    scoreRevealDoneRef.current = false;
    setCardMoment(true);
    setScoringSide(activeCelebration.side);
    setScorePop(false);
    setScoreRevealed(false);
    setNewGoalKey(null);
    revealReadyAtRef.current = Date.now() + GOAL_SCORE_REVEAL_MS;
    revealDeadlineRef.current =
      Date.now() + GOAL_SCORE_REVEAL_MS + GOAL_SCORER_WAIT_MS;

    const minTimer = window.setTimeout(
      () => setRevealTick((tick) => tick + 1),
      GOAL_SCORE_REVEAL_MS,
    );
    const maxTimer = window.setTimeout(
      () => setRevealTick((tick) => tick + 1),
      GOAL_SCORE_REVEAL_MS + GOAL_SCORER_WAIT_MS,
    );

    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
    };
  }, [activeCelebration?.key]);

  useEffect(() => {
    if (!activeCelebration || scoreRevealDoneRef.current) return;

    const details = resolveCelebrationDetails(
      activeCelebration,
      fixture.goals,
    );
    const hasScorer = details.player != null || details.minute != null;
    const now = Date.now();
    if (now < revealReadyAtRef.current) return;
    if (!hasScorer && now < revealDeadlineRef.current) return;

    scoreRevealDoneRef.current = true;
    if (details.player) {
      setNewGoalKey(
        celebrationFlashKey(
          activeCelebration.side,
          details.minute,
          details.player,
        ),
      );
    } else if (details.minute != null) {
      setNewGoalKey(
        celebrationFlashKey(activeCelebration.side, details.minute, "Goal"),
      );
    } else {
      setNewGoalKey(null);
    }
    setScoreRevealed(true);
    setScorePop(true);
  }, [activeCelebration, fixture.goals, revealTick]);

  useEffect(() => {
    if (!scorePop || cardMoment) return;
    const timer = window.setTimeout(() => setScorePop(false), 900);
    return () => window.clearTimeout(timer);
  }, [scorePop, cardMoment]);

  useEffect(() => {
    if (!cardMoment || activeCelebration) return;
    const timer = window.setTimeout(() => {
      setCardMoment(false);
      setScoreRevealed(false);
      setNewGoalKey(null);
    }, scorePop ? 750 : GOAL_CARD_MOMENT_MS);
    return () => window.clearTimeout(timer);
  }, [cardMoment, activeCelebration?.key, scorePop]);

  const inPlay = fixtureInPlay(fixture);
  const finished = fixture.status === "FT" || fixture.phase === "recent";
  const showLive = inPlay || finished;
  const hasScore =
    inPlay || (fixture.homeScore != null && fixture.awayScore != null);
  const showOdds = showMarketOdds && fixture.marketOdds;
  const endedAfterRegulation = settledOnRegulationScore(fixture.terminalStatusId);
  const showVerifiedProof =
    finished && fixture.txlineProof?.showVerifiedBadge === true;

  const holdScore = activeCelebration != null && !scoreRevealed;

  const homeScore = fixture.homeScore ?? 0;
  const awayScore = fixture.awayScore ?? 0;
  const scoreJumpedWithoutCelebration =
    featured &&
    inPlay &&
    !activeCelebration &&
    (homeScore > prevHomeScore.current || awayScore > prevAwayScore.current);

  const celebrationDetails = activeCelebration
    ? resolveCelebrationDetails(activeCelebration, fixture.goals)
    : null;
  const celebratedScorerLabel = celebrationDetails?.player ?? null;
  const holdScorer =
    activeCelebration != null &&
    (!scoreRevealed ||
      (celebratedScorerLabel == null && celebrationDetails?.minute == null));

  const displayHomeScore = activeCelebration
    ? scoreRevealed
      ? activeCelebration.homeScore
      : activeCelebration.prevHomeScore
    : scoreJumpedWithoutCelebration
      ? prevHomeScore.current
      : homeScore;
  const displayAwayScore = activeCelebration
    ? scoreRevealed
      ? activeCelebration.awayScore
      : activeCelebration.prevAwayScore
    : scoreJumpedWithoutCelebration
      ? prevAwayScore.current
      : awayScore;

  const visibleGoals = goalsDuringCelebration(
    fixture.goals,
    activeCelebration,
    holdScore || holdScorer,
  );
  const homeGoals = visibleGoals.filter((g) => g.side === "home");
  const awayGoals = visibleGoals.filter((g) => g.side === "away");

  const inPenaltiesLive = inPenalties;
  const penaltyShootout = displayShootout;
  const showPenaltyMarks =
    penaltyShootout != null && penaltyShootout.kicks.length > 0;
  const showPensSubline =
    penaltyShootout != null &&
    !inPenaltiesLive &&
    (penaltyShootout.kicks.length > 0 ||
      penaltyShootout.homeScore > 0 ||
      penaltyShootout.awayScore > 0);
  const pensFinished =
    penaltyShootout != null && !penaltyShootout.inProgress;
  /** Pen shootout UI active — hide venue / settlement footnotes for the whole phase. */
  const penShootoutOnCard =
    inPenaltiesLive || showPenaltyMarks || showPensSubline;

  useEffect(() => {
    if (!penaltyShootout?.kicks.length) return;

    const currentKeys = penaltyShootout.kicks.map((kick) => penaltyKickKey(kick));

    if (!pensInitializedRef.current) {
      pensInitializedRef.current = true;
      prevPenaltyKickKeysRef.current = new Set(currentKeys);
      setRevealedPenaltyKickKeys(new Set(currentKeys));
      return;
    }

    const prev = prevPenaltyKickKeysRef.current;
    const added: string[] = [];
    for (const key of currentKeys) {
      if (!prev.has(key)) added.push(key);
    }
    if (added.length === 0) return;

    prevPenaltyKickKeysRef.current = new Set(currentKeys);
    setRevealedPenaltyKickKeys((revealed) => {
      const next = new Set(revealed);
      for (const key of added) next.add(key);
      return next;
    });

    setPenNameFlashKeys((flash) => {
      const next = new Set(flash);
      for (const key of added) next.add(key);
      return next;
    });

    const timers = added.map((key) =>
      window.setTimeout(() => {
        setPenNameFlashKeys((flash) => {
          if (!flash.has(key)) return flash;
          const next = new Set(flash);
          next.delete(key);
          return next;
        });
      }, 1000),
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [penaltyShootout?.kicks]);

  const pillText =
    fixture.status === "HT"
      ? "HT"
      : inPenaltiesLive
        ? "Penalties"
        : finished
          ? showVerifiedProof
            ? null
            : pensFinished
              ? "FT · Pens"
              : "FT · Settled via TxLINE"
          : fixture.elapsed != null
            ? `LIVE ${fixture.elapsed}'`
            : "LIVE";

  const renderScorers = (goals: typeof fixture.goals) =>
    showLive && goals.length > 0 ? (
      <ul className={styles.scorers}>
        {groupScorersByPlayer(goals)
          .filter((row) => row.player != null)
          .map((row, index) => {
          const key = `${row.player ?? "unknown"}-${row.minutes.join("-")}-${index}`;
          const flashReady = activeCelebration
            ? scoreRevealed && scorePop
            : scorePop;
          const isNew =
            flashReady &&
            newGoalKey != null &&
            (activeCelebration
              ? (() => {
                  const details = resolveCelebrationDetails(
                    activeCelebration,
                    fixture.goals,
                  );
                  if (row.side !== activeCelebration.side) return false;
                  const rowLabel = goalScorerDisplayName(row);
                  if (details.player && rowLabel !== details.player) return false;
                  if (
                    details.minute != null &&
                    row.minutes.length > 0 &&
                    !row.minutes.includes(details.minute)
                  ) {
                    return false;
                  }
                  return details.player != null || details.minute != null;
                })()
              : goals.some((goal) => {
                  const label = goalScorerDisplayName(goal);
                  if (!label || goalScorerDisplayName(row) !== label) return false;
                  if (
                    goal.minute != null &&
                    !row.minutes.includes(goal.minute)
                  ) {
                    return false;
                  }
                  return (
                    newGoalKey ===
                      celebrationFlashKey(goal.side, goal.minute, label) &&
                    goal.ownGoal === row.ownGoal &&
                    goal.penalty === row.penalty
                  );
                }));
          return (
            <li
              key={key}
              className={`${styles.scorer}${isNew ? ` ${styles.scorerFlash}` : ""}`}
            >
              <span className={styles.scorerLine}>
                {row.minutes.length > 0 ? (
                  <span className={styles.scorerMin}>
                    {formatGoalMinutes(row.minutes)}
                  </span>
                ) : null}
                {row.player ? (
                  <>
                    {row.minutes.length > 0 ? " " : null}
                    <span className={styles.scorerName}>
                      {scorerDisplayName(row)}
                      {row.penalty ? " (P)" : ""}
                      {row.ownGoal ? " (OG)" : ""}
                    </span>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    ) : null;

  const sideClass = (side: "home" | "away") => {
    const scored = !inPenaltiesLive && scoringSide === side && scorePop;
    return `${styles.side}${showPenaltyMarks ? ` ${styles.sidePenLayout}` : ""}${
      scored ? ` ${styles.sideScored}` : ""
    }`;
  };

  const renderSideContent = (
    side: "home" | "away",
    code: string,
    team: string,
    goals: typeof fixture.goals,
  ) => {
    const flag = <Flag code={code} size={featured ? "lg" : "md"} />;
    const teamName = <span className={styles.team}>{team}</span>;
    const scorers = renderScorers(goals);
    const penMarks = showPenaltyMarks ? (
      <div className={styles.sidePenMarks}>
        <PenaltyKickMarks
          kicks={penaltyKicks}
          side={side}
          revealedKeys={revealedPenaltyKickKeys}
          nameFlashKeys={penNameFlashKeys}
        />
      </div>
    ) : null;

    if (!showPenaltyMarks) {
      return (
        <>
          {flag}
          {teamName}
          {scorers}
        </>
      );
    }

    return (
      <>
        <div className={styles.sideTop}>
          {flag}
          {teamName}
          {scorers}
        </div>
        {penMarks}
      </>
    );
  };

  const penaltyKicks = penaltyShootout?.kicks ?? [];

  return (
    <Card
      glow={featured}
      style={cardMoment ? goalCelebrationTimingStyle() : undefined}
      className={`${featured ? styles.featured : styles.compact}${
        cardMoment ? ` ${styles.cardGoalMoment}` : ""
      }${scoreRevealed && scorePop ? ` ${styles.scoreReveal}` : ""}`}
    >
      <div className={styles.meta}>
        {fixture.stage ? (
          <span className={styles.metaGroup}>{fixture.stage}</span>
        ) : null}
        {showLive ? (
          showVerifiedProof && fixture.txlineProof ? (
            <TxLineProofPopover proof={fixture.txlineProof} />
          ) : (
            <span
              className={`${styles.statusPill} ${
                inPlay ? styles.statusLive : styles.statusDone
              } ${finished ? styles.statusSettled : ""} ${
                fixture.stage ? "" : styles.pillSolo
              }`}
            >
              {inPlay ? <span className={styles.pulse} aria-hidden /> : null}
              {pillText}
            </span>
          )
        ) : (
          <span className={fixture.stage ? undefined : styles.metaSolo} suppressHydrationWarning>
            {kickoffLine}
          </span>
        )}
      </div>

      <div
        className={`${styles.matchup} ${showLive ? styles.matchupLive : ""}${
          showPenaltyMarks ? ` ${styles.matchupPenAligned}` : ""
        }`}
      >
        <div className={sideClass("home")}>
          {renderSideContent("home", fixture.homeCode, fixture.home, homeGoals)}
        </div>
        {showLive && hasScore ? (
          <div
            className={`${styles.scoreWrap}${!inPenaltiesLive && scorePop ? ` ${styles.scorePop}` : ""}${
              featured && cardMoment && !inPenaltiesLive ? ` ${styles.scoreFeatured}` : ""
            }`}
          >
            <span
              className={`${styles.score}${featured ? ` ${styles.scoreLarge}` : ""}`}
            >
              <span
                className={`${styles.scoreDigit}${
                  !inPenaltiesLive && scoringSide === "home" && scorePop
                    ? ` ${styles.scoreDigitPop}`
                    : ""
                }`}
              >
                {displayHomeScore}
              </span>
              <span className={styles.scoreDash}>–</span>
              <span
                className={`${styles.scoreDigit}${
                  !inPenaltiesLive && scoringSide === "away" && scorePop
                    ? ` ${styles.scoreDigitPop}`
                    : ""
                }`}
              >
                {displayAwayScore}
              </span>
            </span>
            {showPensSubline && penaltyShootout ? (
              <span className={styles.pensSubline}>
                Pens {penaltyShootout.homeScore}–{penaltyShootout.awayScore}
              </span>
            ) : null}
          </div>
        ) : (
          <span className={styles.vs}>vs</span>
        )}
        <div className={sideClass("away")}>
          {renderSideContent("away", fixture.awayCode, fixture.away, awayGoals)}
        </div>
      </div>

      {!penShootoutOnCard && fixture.venueLine ? (
        <p className={styles.venue}>{fixture.venueLine}</p>
      ) : null}

      {!penShootoutOnCard &&
      finished &&
      endedAfterRegulation &&
      !pensFinished ? (
        <p className={styles.settlementNote}>Settled on 90-min score</p>
      ) : !penShootoutOnCard && finished && pensFinished ? (
        <p className={styles.settlementNote}>Predictions settled on 90-min draw</p>
      ) : null}

      {showOdds && fixture.marketOdds ? (
        <MarketOddsLine
          home={fixture.home}
          away={fixture.away}
          odds={fixture.marketOdds}
          locked={showLive}
          compact={!featured && showLive}
          hideHint
        />
      ) : null}

      {withReply && !showLive ? <ExampleCallPreview fixture={fixture} /> : null}
    </Card>
  );
}
