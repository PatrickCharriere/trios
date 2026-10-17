"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  EXCHANGE_MIN_BAG,
  MAX_VALUE,
  evaluatePlacement,
  isBoardEmpty,
  readBoard,
  readSquare,
  sinceLastTurn,
  type CoachPosition,
  type Danger,
  type GameView,
  type LogEntry,
  type Move,
  type PlacedTile,
  type Placement,
  type RuleError,
} from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { positionOf, runCoach, runDanger } from "@/lib/coach/client";
import { useTeaching } from "@/lib/teaching";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { Board, type PendingTile, type SquareMark } from "./Board";
import { Modal } from "./Modal";
import { MoveHistory, tilesAt } from "./MoveHistory";
import { SquareNote, TeachingPanel, type BoardAid, type DangerStatus, type Review } from "./Teaching";
import { MiniTiles, TileFace } from "./TileFace";

export interface GameTableProps {
  view: GameView;
  /** True when the seat shown may act right now. */
  canAct: boolean;
  /** Banner shown when the player can't act (whose turn, thinking...). */
  waiting?: ReactNode;
  /** Extra notice, such as a connection problem. */
  notice?: string | null;
  onMove: (move: Move) => Promise<RuleError | null> | RuleError | null;
  overActions?: ReactNode;
  /**
   * Teaching help during the game (the coach's ideas, reading a square, what
   * fits where). Off in online games, where it would tip a game against other
   * people; the review after each move stays available everywhere.
   */
  liveHelp?: boolean;
}

interface Draft {
  version: number;
  placements: Placement[];
  selected: number | null;
  mode: "place" | "exchange" | "confirmPass";
  swap: number[];
}

const VALUES = Array.from({ length: MAX_VALUE + 1 }, (_, v) => v);

/** On the danger map, squares where the next player's best averages at least this many points stand out. */
const DANGER_FROM = 15;

/** From this width the board has room on both sides: learning on the left, play on the right. */
const WIDE = "(min-width: 1200px)";

export function GameTable({ view, canAct, waiting, notice, onMove, overActions, liveHelp = false }: GameTableProps) {
  const { t } = useI18n();
  const [teaching] = useTeaching();
  const help = teaching && liveHelp;
  const [aid, setAid] = useState<BoardAid>("none");
  const [danger, setDanger] = useState<{ board: readonly (PlacedTile | null)[]; list: Danger[] } | null>(null);
  const wide = useMediaQuery(WIDE);
  const [inspected, setInspected] = useState<number | null>(null);
  const [historyPick, setHistoryPick] = useState<number | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const fresh = useCallback(
    (): Draft => ({ version: view.version, placements: [], selected: null, mode: "place", swap: [] }),
    [view.version],
  );
  const [stored, setDraft] = useState<Draft>(fresh);
  // Anything drafted against an older position is dropped when the game moves on.
  const draft = stored.version === view.version ? stored : fresh();
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const [wildFor, setWildFor] = useState<{ tileId: number; cell: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [moveError, setMoveError] = useState<{ version: number; error: RuleError } | null>(null);

  const active = canAct && !busy && view.status === "playing";
  const { placements } = draft;
  const usedIds = new Set(placements.map((p) => p.tileId));
  const rackLeft = view.rack.filter((tile) => !usedIds.has(tile.id));

  const evaluation = useMemo(
    () =>
      placements.length ? evaluatePlacement(view.board, view.rack, placements, { noSquares: view.firstRound }) : null,
    [view.board, view.rack, view.firstRound, placements],
  );

  const pending = useMemo(() => {
    const map = new Map<number, PendingTile>();
    for (const p of placements) {
      const tile = view.rack.find((t) => t.id === p.tileId);
      if (tile) map.set(p.cell, { value: tile.face ?? p.value ?? null, wild: tile.face === null });
    }
    return map;
  }, [placements, view.rack]);

  const recent = useMemo(() => sinceLastTurn(view.log, view.seat), [view.log, view.seat]);

  // The tiles the others placed since your last turn. Once you have played (or
  // when watching), the latest move instead, whoever made it.
  const lastCells = useMemo(() => {
    const latest = [...view.log].reverse().find((e) => e.type === "place");
    const moves = recent.length > 0 ? recent : latest ? [latest] : [];
    return new Set(moves.flatMap((e) => (e.type === "place" ? e.cells : [])));
  }, [recent, view.log]);

  const errorCells = useMemo(
    () => new Set(evaluation && !evaluation.ok ? (evaluation.cells ?? []) : []),
    [evaluation],
  );

  // Teaching: squares are read with the tiles being drafted counted in, so the
  // labels follow the move as it is built.
  const boardWithDraft = useMemo(() => {
    if (placements.length === 0) return view.board;
    const next: (PlacedTile | null)[] = view.board.slice();
    for (const p of placements) {
      const tile = view.rack.find((r) => r.id === p.tileId);
      if (tile) next[p.cell] = { id: tile.id, value: tile.face ?? p.value ?? 0, wild: tile.face === null, player: -1, turn: -1 };
    }
    return next;
  }, [view.board, view.rack, placements]);

  // Teaching: the danger map is worked out for the board with the draft on it,
  // shortly after it settles; a newer position stops the older run.
  const nextPlayer = view.current === view.seat ? (view.current + 1) % view.players.length : view.current;
  const nextRack = view.rackCounts[nextPlayer] ?? 0;
  useEffect(() => {
    if (!help || aid !== "danger" || view.status !== "playing" || view.seat === null) return;
    let stopped = false;
    const board = boardWithDraft;
    const timer = window.setTimeout(() => {
      const position = { board, rack: view.rack, firstRound: view.firstRound, nextRack };
      void runDanger(position, () => stopped).then((list) => {
        if (list) setDanger({ board, list });
      });
    }, 150);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [help, aid, view.status, view.seat, view.rack, view.firstRound, nextRack, boardWithDraft]);
  const dangers = danger && danger.board === boardWithDraft ? danger.list.filter((d) => d.average >= DANGER_FROM) : null;

  const marks = useMemo(() => {
    if (!help || view.status !== "playing") return undefined;
    const map = new Map<number, SquareMark>();
    if (aid === "danger") {
      for (const d of dangers ?? []) {
        const level = d.average >= 50 ? 3 : d.average >= 30 ? 2 : 1;
        map.set(d.cell, { label: String(d.most), kind: "danger", level, spoken: t.teach.dangerLabel(d.most) });
      }
      return map;
    }
    if (aid !== "fits") return undefined;
    const inHand = view.rack.filter((tile) => !placements.some((p) => p.tileId === tile.id));
    for (const reading of readBoard(boardWithDraft, { firstRound: view.firstRound })) {
      const values = reading.options.map((o) => o.value);
      const fits = inHand.some((tile) => (tile.face === null ? values.length > 0 : values.includes(tile.face)));
      const trio = reading.options.find((o) => o.trio);
      const label = trio ? String(trio.value) : values.length ? `≤${Math.max(...values)}` : "✕";
      const kind = trio ? "trio" : values.length ? "pair" : "blocked";
      map.set(reading.cell, { label, kind, fits: kind !== "blocked" && fits, spoken: t.teach.markLabel(label) });
    }
    return map;
  }, [help, aid, dangers, t, view.status, view.rack, view.firstRound, placements, boardWithDraft]);

  const dangerStatus: DangerStatus | null =
    aid !== "danger" ? null : !dangers ? "working" : dangers.length ? "shown" : "none";

  const reading = useMemo(
    () => (help && inspected !== null ? readSquare(boardWithDraft, inspected, { firstRound: view.firstRound }) : null),
    [help, inspected, boardWithDraft, view.firstRound],
  );

  const note = reading && (
    <SquareNote
      reading={reading}
      rack={rackLeft}
      danger={aid === "danger" ? dangers?.find((d) => d.cell === reading.cell) : undefined}
      onClose={() => setInspected(null)}
    />
  );

  const focusCells = useMemo(() => {
    const cells = new Set<number>();
    const picked = historyPick !== null ? view.log[historyPick] : undefined;
    if (picked?.type === "place") picked.cells.forEach((c) => cells.add(c));
    if (reading) cells.add(reading.cell);
    return cells;
  }, [historyPick, view.log, reading]);

  const placeTile = (tileId: number, cell: number) => {
    if (!active || view.board[cell] || placements.some((p) => p.cell === cell)) return;
    const tile = view.rack.find((t) => t.id === tileId);
    if (!tile || usedIds.has(tileId)) return;
    if (tile.face === null) {
      setWildFor({ tileId, cell });
      return;
    }
    update({ placements: [...placements, { tileId, cell }], selected: null, mode: "place" });
  };

  const onCell = (cell: number) => {
    if (active && draft.mode === "place") {
      const existing = placements.find((p) => p.cell === cell);
      if (existing) {
        update({ placements: placements.filter((p) => p !== existing), selected: null });
        return;
      }
      const tileId = draft.selected ?? (rackLeft.length === 1 ? rackLeft[0].id : null);
      if (tileId !== null) {
        placeTile(tileId, cell);
        return;
      }
    }
    // Teaching: with no tile in hand, a tap reads the square instead.
    if (help && !view.board[cell]) setInspected(inspected === cell ? null : cell);
  };

  // Teaching: once a move is made, the coach looks back at the position it was made from.
  const startReview = (seat: number, position: CoachPosition, move: Move) => {
    const played = move.type === "place" ? move.placements : null;
    const entry: Review = { seat, position, played, analysis: null };
    setReview(entry);
    void runCoach(position, played ? { include: played } : {}).then((analysis) =>
      setReview((current) => (current === entry ? { ...entry, analysis } : current)),
    );
  };

  const submit = async (move: Move) => {
    const before = teaching && view.seat !== null ? positionOf(view) : null;
    const seat = view.seat;
    setBusy(true);
    setMoveError(null);
    try {
      const error = await onMove(move);
      if (error) setMoveError({ version: view.version, error });
      else if (before && seat !== null) startReview(seat, before, move);
    } finally {
      setBusy(false);
    }
  };

  // Shows one of the coach's ideas as a draft, ready to play or take back.
  const preview = (next: Placement[]) => {
    if (active) setDraft({ version: view.version, placements: next, selected: null, mode: "place", swap: [] });
  };

  const currentName = view.players[view.current]?.name ?? "";
  const bagLow = view.bagCount < EXCHANGE_MIN_BAG;
  const shownError = moveError && moveError.version === view.version ? moveError.error : null;

  let statusLine: ReactNode;
  if (view.status === "over") {
    statusLine = null;
  } else if (!canAct) {
    statusLine = waiting ?? t.game.turnOf(currentName);
  } else if (shownError) {
    statusLine = <span className="bad">{t.errors[shownError]}</span>;
  } else if (draft.mode === "exchange") {
    statusLine = bagLow ? <span className="bad">{t.errors.exchangeBagLow}</span> : t.game.exchangeHint;
  } else if (draft.mode === "confirmPass") {
    statusLine = t.game.confirmPass;
  } else if (evaluation?.ok) {
    statusLine = (
      <span className="good">
        {t.game.points(evaluation.score)}
        {evaluation.groups.some((g) => g.trio) && <> · {t.game.trio}</>}
        {evaluation.triolet && <> · {t.game.triolet}</>}
        {evaluation.replay && <> · {t.game.replay}</>}
      </span>
    );
  } else if (evaluation && !evaluation.ok) {
    statusLine = <span className="bad">{t.errors[evaluation.error]}</span>;
  } else {
    statusLine = (
      <>
        <strong>{t.game.yourTurn}.</strong> {isBoardEmpty(view.board) ? t.game.hintFirst : t.game.hint}
      </>
    );
  }

  return (
    <div className={`table${teaching ? " learning" : ""}`}>
      <div className="side side-play">
        <section className="area-scores panel" aria-label="Scores">
          <ul className="scores">
            {view.players.map((player, i) => (
              <li key={i} className={i === view.current && view.status === "playing" ? "current" : ""}>
                <span className="who">
                  {player.name}
                  {i === view.seat && (
                    <>
                      {" "}
                      <span className="you">({t.game.you})</span>
                    </>
                  )}
                </span>
                <span className="dots" role="img" aria-label={t.game.tiles(view.rackCounts[i])}>
                  {Array.from({ length: view.rackCounts[i] }, (_, k) => (
                    <span key={k} />
                  ))}
                </span>
                <span className="score">{player.score}</span>
              </li>
            ))}
          </ul>
          <p className="bag">{t.game.bagCount(view.bagCount)}</p>
        </section>

        <section className="area-controls panel">
          {view.status === "over" ? (
            <GameOver view={view} actions={overActions} notice={notice} />
          ) : (
            <>
              {recent.length > 0 && <Recap view={view} entries={recent} />}
              <p className="status" aria-live="polite">{statusLine}</p>
              {notice && <p className="notice">{notice}</p>}
              {view.seat !== null ? (
                <div className="rack" role="group" aria-label={t.game.rack}>
                  {(draft.mode === "exchange" ? view.rack : rackLeft).map((tile) => {
                    const selected =
                      draft.mode === "exchange" ? draft.swap.includes(tile.id) : draft.selected === tile.id;
                    return (
                      <button
                        key={tile.id}
                        type="button"
                        className={`rack-slot${selected ? " selected" : ""}`}
                        draggable={active && draft.mode === "place"}
                        disabled={!active || draft.mode === "confirmPass"}
                        aria-pressed={selected}
                        aria-label={tile.face === null ? t.game.wild : String(tile.face)}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(tile.id))}
                        onClick={() => {
                          if (draft.mode === "exchange") {
                            update({
                              swap: selected ? draft.swap.filter((id) => id !== tile.id) : [...draft.swap, tile.id],
                            });
                          } else {
                            update({ selected: selected ? null : tile.id });
                          }
                        }}
                      >
                        <TileFace value={tile.face} wild={tile.face === null} />
                      </button>
                    );
                  })}
                  {draft.mode !== "exchange" &&
                    placements.map((p) => <span key={`gap-${p.tileId}`} className="rack-slot empty" />)}
                </div>
              ) : (
                <p className="muted">{t.game.spectator}</p>
              )}
              {canAct && (
                <div className="actions">
                  {draft.mode === "place" && (
                    <>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!active || !evaluation?.ok}
                        onClick={() => submit({ type: "place", placements })}
                      >
                        {t.game.play}
                      </button>
                      {placements.length > 0 ? (
                        <button type="button" className="btn" disabled={!active} onClick={() => setDraft(fresh())}>
                          {t.game.recall}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn"
                            disabled={!active}
                            onClick={() => update({ mode: "exchange", swap: [], selected: null })}
                          >
                            {t.game.exchange}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={!active}
                            onClick={() => update({ mode: "confirmPass", selected: null })}
                          >
                            {t.game.pass}
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {draft.mode === "exchange" && (
                    <>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!active || draft.swap.length === 0 || bagLow}
                        onClick={() => submit({ type: "exchange", tileIds: draft.swap })}
                      >
                        {t.game.swap(draft.swap.length)}
                      </button>
                      <button type="button" className="btn" onClick={() => setDraft(fresh())}>
                        {t.game.cancel}
                      </button>
                    </>
                  )}
                  {draft.mode === "confirmPass" && (
                    <>
                      <button type="button" className="btn primary" disabled={!active} onClick={() => submit({ type: "pass" })}>
                        {t.game.pass}
                      </button>
                      <button type="button" className="btn" onClick={() => setDraft(fresh())}>
                        {t.game.cancel}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section className="area-log panel">
          <h3>{t.game.lastMoves}</h3>
          <MoveHistory view={view} selected={historyPick} onSelect={setHistoryPick} />
        </section>
      </div>

      <section className="area-board">
        <Board
          board={view.board}
          pending={pending}
          pendingValid={!!evaluation?.ok}
          lastCells={lastCells}
          errorCells={errorCells}
          interactive={active && draft.mode === "place"}
          onCell={onCell}
          onDropTile={(cell, tileId) => placeTile(tileId, cell)}
          marks={marks}
          focusCells={focusCells}
          inspectable={help}
        />
        {!wide && note}
      </section>

      <ul className="area-legend legend" aria-hidden="true">
        <li><span className="key sq-double">×2</span>{t.game.legendDouble}</li>
        <li><span className="key sq-triple">×3</span>{t.game.legendTriple}</li>
        <li><span className="key sq-replay">↻</span>{t.game.legendReplay}</li>
        <li><span className="key sq-centre">★</span>{t.game.legendCentre}</li>
      </ul>

      <div className="side side-learn">
        <TeachingPanel
          view={view}
          liveHelp={liveHelp}
          canAct={active}
          aid={aid}
          onAid={setAid}
          danger={dangerStatus}
          note={wide ? note : null}
          review={review}
          onPreview={preview}
        />
      </div>

      {wildFor && (
        <WildPicker
          onPick={(value) => {
            update({
              placements: [...placements, { tileId: wildFor.tileId, cell: wildFor.cell, value }],
              selected: null,
            });
            setWildFor(null);
          }}
          onCancel={() => setWildFor(null)}
        />
      )}
    </div>
  );
}

/** The other players' moves since your last turn, with the tiles they placed. */
function Recap({ view, entries }: { view: GameView; entries: LogEntry[] }) {
  const { t } = useI18n();
  return (
    <ul className="recap" aria-live="polite">
      {entries.map((entry, i) => {
        const name = view.players[entry.player]?.name ?? "";
        if (entry.type !== "place") {
          return (
            <li key={i} className="muted">
              {entry.type === "exchange" ? t.log.exchange(name, entry.count) : t.log.pass(name)}
            </li>
          );
        }
        return (
          <li key={i}>
            {t.recap.placed(name)}{" "}
            <span className="recap-move">
              <MiniTiles tiles={tilesAt(view.board, entry.cells)} />
              {t.recap.scored(entry.score)}
            </span>
            {entry.triolet && <> <span className="tag">Triolet</span></>}
            {entry.replay && <> <span className="tag">↻</span></>}
          </li>
        );
      })}
    </ul>
  );
}

function GameOver({ view, actions, notice }: { view: GameView; actions?: ReactNode; notice?: string | null }) {
  const { lang, t } = useI18n();
  const winners = (view.winners ?? []).map((i) => view.players[i].name);
  const list = new Intl.ListFormat(lang, { type: "conjunction" }).format(winners);
  return (
    <div className="game-over" role="status">
      <h2>{t.over.title}</h2>
      <p className="winner">{winners.length === 1 ? t.over.winner(winners[0]) : t.over.tie(list)}</p>
      <p className="muted">
        {view.endReason === "out" && view.finalBonus
          ? t.over.out(view.players[view.finalBonus.player].name, view.finalBonus.points)
          : view.endReason === "blocked"
            ? t.over.blocked
            : t.over.stalled}
      </p>
      {view.aside && view.aside.length > 0 && (
        <div className="set-aside">
          <p className="muted small">{t.over.aside}</p>
          <div className="set-aside-tiles">
            {view.aside.map((tile) => (
              <span key={tile.id} role="img" aria-label={tile.face === null ? t.game.wild : String(tile.face)}>
                <TileFace value={tile.face} wild={tile.face === null} />
              </span>
            ))}
          </div>
        </div>
      )}
      {notice && <p className="notice">{notice}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

function WildPicker({ onPick, onCancel }: { onPick: (value: number) => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t.game.wildTitle} onDismiss={onCancel} className="wild">
      <p className="muted small">{t.game.wildHint}</p>
      <div className="wild-grid">
        {VALUES.map((v) => (
          <button key={v} type="button" className="btn wild-value" onClick={() => onPick(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t.game.cancel}
        </button>
      </div>
    </Modal>
  );
}
