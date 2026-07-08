"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { GoalCelebration } from "./goalCelebration";
import {
  GOAL_CARD_MOMENT_MS,
  GOAL_SCORE_REVEAL_MS,
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
  };
}

function celebrationGoalDisplayName(
  goal: MundialGoal,
  event: GoalCelebration,
): string | null {
  return goalScorerDisplayName(enrichGoalFromCelebration(goal, event));
}

function goalsDuringCelebration(
  goals: MundialGoal[],
  event: GoalCelebration | null,
  hidePending: boolean,
): MundialGoal[] {
  if (!event) return goals;

  return goals
    .filter((goal) => {
      if (!isCelebrationGoal(goal, event)) return true;
      if (hidePending) return false;
      return celebrationGoalDisplayName(goal, event) != null;
    })
    .map((goal) =>
      isCelebrationGoal(goal, event) ? enrichGoalFromCelebration(goal, event) : goal,
    );
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

    const latest = fixture.goals[fixture.goals.length - 1];
    if (latest) {
      const key = `${latest.side}-${latest.minute}-${latest.player}`;
      setNewGoalKey(key);
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

  useEffect(() => {
    if (!activeCelebration) {
      if (hadCelebrationRef.current) {
        hadCelebrationRef.current = false;
        setScorePop(false);
        setScoreRevealed(false);
        setNewGoalKey(null);
        setCardMoment(false);
      }
      return;
    }

    hadCelebrationRef.current = true;
    setCardMoment(true);
    setScoringSide(activeCelebration.side);
    setScorePop(false);
    setScoreRevealed(false);
    setNewGoalKey(null);

    const revealTimer = window.setTimeout(() => {
      const minute = activeCelebration.minute;
      const player = activeCelebration.player;
      if (player) {
        setNewGoalKey(`${activeCelebration.side}-${minute ?? "goal"}-${player}`);
      }
      setScoreRevealed(true);
      setScorePop(true);
    }, GOAL_SCORE_REVEAL_MS);

    return () => window.clearTimeout(revealTimer);
  }, [activeCelebration?.key, activeCelebration]);

  useEffect(() => {
    if (!activeCelebration || !scoreRevealed || newGoalKey != null) return;
    const celebrated = fixture.goals.find((goal) =>
      isCelebrationGoal(goal, activeCelebration),
    );
    const label =
      activeCelebration.player ??
      (celebrated ? celebrationGoalDisplayName(celebrated, activeCelebration) : null);
    if (!label) return;
    const minute = activeCelebration.minute ?? celebrated?.minute ?? null;
    setNewGoalKey(`${activeCelebration.side}-${minute}-${label}`);
  }, [activeCelebration, scoreRevealed, fixture.goals, newGoalKey]);

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

  const celebratedGoal = activeCelebration
    ? fixture.goals.find((goal) => isCelebrationGoal(goal, activeCelebration))
    : undefined;
  const celebratedScorerLabel = activeCelebration
    ? activeCelebration.player ??
      (celebratedGoal
        ? celebrationGoalDisplayName(celebratedGoal, activeCelebration)
        : null)
    : null;
  const holdScorer =
    activeCelebration != null &&
    (!scoreRevealed || celebratedScorerLabel == null);

  const displayHomeScore = holdScore
    ? activeCelebration.prevHomeScore
    : (fixture.homeScore ?? 0);
  const displayAwayScore = holdScore
    ? activeCelebration.prevAwayScore
    : (fixture.awayScore ?? 0);

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
          const isNew =
            newGoalKey != null &&
            goals.some((goal) => {
              const enriched =
                activeCelebration && isCelebrationGoal(goal, activeCelebration)
                  ? enrichGoalFromCelebration(goal, activeCelebration)
                  : goal;
              const label = goalScorerDisplayName(enriched);
              if (!label || goalScorerDisplayName(row) !== label) return false;
              if (
                enriched.minute != null &&
                !row.minutes.includes(enriched.minute)
              ) {
                return false;
              }
              return (
                newGoalKey === `${enriched.side}-${enriched.minute}-${label}` &&
                enriched.ownGoal === row.ownGoal &&
                enriched.penalty === row.penalty
              );
            });
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
    return `${styles.side}${scored ? ` ${styles.sideScored}` : ""}`;
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

      <div className={`${styles.matchup} ${showLive ? styles.matchupLive : ""}`}>
        <div className={sideClass("home")}>
          <Flag code={fixture.homeCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.home}</span>
          {renderScorers(homeGoals)}
          {showPenaltyMarks ? (
            <PenaltyKickMarks
              kicks={penaltyKicks}
              side="home"
              revealedKeys={revealedPenaltyKickKeys}
              nameFlashKeys={penNameFlashKeys}
            />
          ) : null}
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
          <Flag code={fixture.awayCode} size={featured ? "lg" : "md"} />
          <span className={styles.team}>{fixture.away}</span>
          {renderScorers(awayGoals)}
          {showPenaltyMarks ? (
            <PenaltyKickMarks
              kicks={penaltyKicks}
              side="away"
              revealedKeys={revealedPenaltyKickKeys}
              nameFlashKeys={penNameFlashKeys}
            />
          ) : null}
        </div>
      </div>

      {!showPenaltyMarks && !showPensSubline && fixture.venueLine ? (
        <p className={styles.venue}>{fixture.venueLine}</p>
      ) : null}

      {!showPenaltyMarks &&
      !showPensSubline &&
      finished &&
      endedAfterRegulation &&
      !pensFinished ? (
        <p className={styles.settlementNote}>Settled on 90-min score</p>
      ) : !showPenaltyMarks && !showPensSubline && finished && pensFinished ? (
        <p className={styles.settlementNote}>Predictions settled on 90-min draw</p>
      ) : !showPenaltyMarks && !showPensSubline && inPenaltiesLive ? (
        <p className={styles.settlementNote}>Predictions locked at 90 min</p>
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
