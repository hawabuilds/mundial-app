"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchFirstGoalscorerMatchState,
  saveFirstGoalscorerPrediction,
  type FirstGoalscorerLineupPlayer,
  type FirstGoalscorerMatchState,
} from "@/app/lib/leaderboard-client";
import Button from "./Button";
import Flag from "./Flag";
import styles from "./FirstGoalscorerPicker.module.css";

type Props = {
  matchId: number;
  onClose: () => void;
  onSaved?: () => void;
};

function fullScoreLine(
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
): string {
  return `${home} ${homeScore}–${awayScore} ${away}`;
}

function filterPlayers(
  players: FirstGoalscorerLineupPlayer[],
  query: string,
  side: "home" | "away" | "all",
): FirstGoalscorerLineupPlayer[] {
  const q = query.trim().toLowerCase();
  return players.filter((player) => {
    if (side !== "all" && player.side !== side) return false;
    if (!q) return true;
    return (
      player.name.toLowerCase().includes(q) ||
      player.shortName.toLowerCase().includes(q)
    );
  });
}

export default function FirstGoalscorerPicker({ matchId, onClose, onSaved }: Props) {
  const [state, setState] = useState<FirstGoalscorerMatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [manualSide, setManualSide] = useState<"home" | "away">("home");
  const [manualName, setManualName] = useState("");
  const [selected, setSelected] = useState<{
    playerId: number | null;
    playerName: string;
    playerSide: "home" | "away";
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchFirstGoalscorerMatchState(matchId)
      .then((data) => {
        if (cancelled) return;
        setState(data);
        if (data.prediction) {
          setSelected({
            playerId: data.prediction.playerId,
            playerName: data.prediction.playerName,
            playerSide: data.prediction.playerSide,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load picker");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const lineupMode = state?.lineup.source === "txline";
  const homeCode = state?.fixture.homeCode ?? "XX";
  const awayCode = state?.fixture.awayCode ?? "XX";

  const filteredLineup = useMemo(() => {
    if (!state || !lineupMode) return [];
    return filterPlayers(state.lineup.players, query, "all");
  }, [state, lineupMode, query]);

  const homeLineup = filteredLineup.filter((p) => p.side === "home");
  const awayLineup = filteredLineup.filter((p) => p.side === "away");

  const canSaveManual =
    !lineupMode && manualName.trim().length >= 2 && Boolean(state?.eligible && !state.locked);

  const canSaveLineup =
    lineupMode &&
    selected != null &&
    Boolean(state?.eligible && !state.locked);

  const handleSave = useCallback(async () => {
    if (!state) return;
    const payload = lineupMode
      ? selected
      : {
          playerId: null as number | null,
          playerName: manualName.trim(),
          playerSide: manualSide,
        };
    if (!payload?.playerName) return;

    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveFirstGoalscorerPrediction({
        matchId,
        playerId: payload.playerId,
        playerName: payload.playerName,
        playerSide: payload.playerSide,
      });
      if (saved) {
        setState((prev) => (prev ? { ...prev, prediction: saved } : prev));
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save pick");
    } finally {
      setSaving(false);
    }
  }, [state, lineupMode, selected, manualName, manualSide, matchId, onClose, onSaved]);

  const showSaveFooter =
    Boolean(state?.eligible && !state.locked && !loading && !error);

  const modal = (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-goalscorer-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <header className={styles.header}>
          <span className={styles.headerRail} aria-hidden />
          <div className={styles.headerMain}>
            <p className={styles.kicker}>Double your points</p>
            <h2 id="first-goalscorer-title" className={styles.title}>
              Pick first goalscorer
            </h2>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {loading ? (
          <p className={styles.message}>Loading lineup…</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : !state ? (
          <p className={styles.error}>Could not load match.</p>
        ) : !state.eligible ? (
          <div className={styles.body}>
            <div className={styles.matchHero}>
              <Flag code={homeCode} size="md" />
              <p className={styles.matchup}>
                <span className={styles.teamName}>{state.fixture.home}</span>
                <span className={styles.vs}>vs</span>
                <span className={styles.teamName}>{state.fixture.away}</span>
              </p>
              <Flag code={awayCode} size="md" />
            </div>
            <p className={styles.message}>
              Post your scoreline on X first, then come back to pick the first goalscorer.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.body}>
              {state.scorePrediction ? (
                <div className={styles.scorePick}>
                  <span className={styles.scoreLabel}>Your score pick</span>
                  <p className={styles.scoreValue}>
                    {fullScoreLine(
                      state.fixture.home,
                      state.fixture.away,
                      state.scorePrediction.home,
                      state.scorePrediction.away,
                    )}
                  </p>
                </div>
              ) : null}

              {state.locked ? (
                <p className={styles.locked}>
                  Picks locked at kickoff
                  {state.prediction ? (
                    <>
                      {" "}
                      · You picked{" "}
                      <strong>{state.prediction.playerName}</strong>
                    </>
                  ) : (
                    " · No pick saved"
                  )}
                </p>
              ) : (
                <>
                  <p className={styles.hint}>
                    Correct first goalscorer doubles your match points.
                  </p>

                  {lineupMode ? (
                    <>
                      <label className={styles.searchWrap}>
                        <span className="m-label">Search players</span>
                        <input
                          className={styles.search}
                          type="search"
                          placeholder="Type a name…"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          autoFocus
                        />
                      </label>

                      <div className={styles.columns}>
                        <section className={styles.teamColumn}>
                          <p className={styles.teamLabel}>
                            <Flag code={homeCode} size="sm" /> {state.fixture.home}
                          </p>
                          <ul className={styles.playerList}>
                            {homeLineup.map((player) => {
                              const active =
                                selected?.playerId === player.playerId &&
                                selected.playerSide === "home";
                              return (
                                <li key={player.playerId}>
                                  <button
                                    type="button"
                                    className={`${styles.playerBtn}${
                                      active ? ` ${styles.playerBtnActive}` : ""
                                    }`}
                                    onClick={() =>
                                      setSelected({
                                        playerId: player.playerId,
                                        playerName: player.name,
                                        playerSide: "home",
                                      })
                                    }
                                  >
                                    {player.shortName}
                                  </button>
                                </li>
                              );
                            })}
                            {homeLineup.length === 0 ? (
                              <li className={styles.emptyTeam}>No matches</li>
                            ) : null}
                          </ul>
                        </section>

                        <section className={styles.teamColumn}>
                          <p className={styles.teamLabel}>
                            <Flag code={awayCode} size="sm" /> {state.fixture.away}
                          </p>
                          <ul className={styles.playerList}>
                            {awayLineup.map((player) => {
                              const active =
                                selected?.playerId === player.playerId &&
                                selected.playerSide === "away";
                              return (
                                <li key={player.playerId}>
                                  <button
                                    type="button"
                                    className={`${styles.playerBtn}${
                                      active ? ` ${styles.playerBtnActive}` : ""
                                    }`}
                                    onClick={() =>
                                      setSelected({
                                        playerId: player.playerId,
                                        playerName: player.name,
                                        playerSide: "away",
                                      })
                                    }
                                  >
                                    {player.shortName}
                                  </button>
                                </li>
                              );
                            })}
                            {awayLineup.length === 0 ? (
                              <li className={styles.emptyTeam}>No matches</li>
                            ) : null}
                          </ul>
                        </section>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.manualNote}>
                        Lineup not published yet — enter a player name and team.
                      </p>
                      <div className={styles.teamToggle}>
                        <button
                          type="button"
                          className={`${styles.teamToggleBtn}${
                            manualSide === "home" ? ` ${styles.teamToggleBtnActive}` : ""
                          }`}
                          onClick={() => setManualSide("home")}
                        >
                          <Flag code={homeCode} size="sm" /> {state.fixture.home}
                        </button>
                        <button
                          type="button"
                          className={`${styles.teamToggleBtn}${
                            manualSide === "away" ? ` ${styles.teamToggleBtnActive}` : ""
                          }`}
                          onClick={() => setManualSide("away")}
                        >
                          <Flag code={awayCode} size="sm" /> {state.fixture.away}
                        </button>
                      </div>
                      <label className={styles.searchWrap}>
                        <span className="m-label">Player name</span>
                        <input
                          className={styles.search}
                          type="text"
                          placeholder="e.g. Mbappé, Kylian"
                          value={manualName}
                          onChange={(event) => setManualName(event.target.value)}
                          autoFocus
                        />
                      </label>
                    </>
                  )}

                  {saveError ? <p className={styles.error}>{saveError}</p> : null}
                </>
              )}
            </div>

            {showSaveFooter ? (
              <footer className={styles.footer}>
                <div className={styles.actions}>
                  <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleSave()}
                    disabled={saving || !(canSaveLineup || canSaveManual)}
                  >
                    {saving ? "Saving…" : state.prediction ? "Update pick" : "Save pick"}
                  </Button>
                </div>
              </footer>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
