"use client";

import { useState } from "react";
import {
  MAX_VALUE,
  TRIOS_OF_15,
  grade,
  reasons,
  type Analysis,
  type CoachPosition,
  type GameView,
  type Idea,
  type Placement,
  type Reason,
  type SquareReading,
  type Tile,
} from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { positionOf, runCoach } from "@/lib/coach/client";
import { useTeaching } from "@/lib/teaching";
import { Board, type PendingTile } from "./Board";
import { Modal } from "./Modal";
import { MiniTiles } from "./TileFace";

/** The coach's look back at a move the player just made. */
export interface Review {
  seat: number;
  /** The position before the move, as the player saw it. */
  position: CoachPosition;
  /** The tiles played; null after an exchange or a pass. */
  played: Placement[] | null;
  /** Null while the coach is still working. */
  analysis: Analysis | null;
}

const VALUES = Array.from({ length: MAX_VALUE + 1 }, (_, v) => v);
const NONE: ReadonlySet<number> = new Set();

/** The tiles of a move that isn't on the board, from the rack it is played from. */
function moveTiles(placements: readonly Placement[], rack: readonly Tile[]) {
  return placements.map((p) => {
    const face = rack.find((t) => t.id === p.tileId)?.face;
    return { value: face ?? p.value ?? null, wild: face === null };
  });
}

const sameMove = (a: Idea, b: Idea) => JSON.stringify(a.placements) === JSON.stringify(b.placements);

function Reasons({ items }: { items: Reason[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <ul className="reasons">
      {items.map((r) => (
        <li key={r.kind}>{t.teach.reason(r)}</li>
      ))}
    </ul>
  );
}

/** What can go on the square the player tapped, and why. */
export function SquareNote({
  reading,
  rack,
  onClose,
}: {
  reading: SquareReading;
  rack: readonly Tile[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const say = t.teach.square;
  const lines = reading.lines.map((line) => {
    const tiles = line.run.filter((v): v is number => v !== null);
    const sum = tiles.join(" + ");
    if (line.need.kind === "trio") return say.trio(sum, line.sum, line.need.value);
    if (line.need.kind === "pair") return say.pair(tiles[0], line.need.max);
    return line.need.reason === "tooLong" ? say.tooLong : say.tooHigh(sum, line.sum);
  });

  let summary: string;
  const trio = reading.options.find((o) => o.trio);
  if (trio) {
    summary = say.trioHere(trio.value, trio.points);
  } else if (reading.options.length > 0) {
    summary = say.range(Math.max(...reading.options.map((o) => o.value)));
  } else {
    // The lines alone would allow a value: then it's the ban on squares that rules it out.
    const linesAllow = VALUES.some((v) =>
      reading.lines.every((l) =>
        l.need.kind === "trio" ? l.need.value === v : l.need.kind === "pair" ? v <= l.need.max : false,
      ),
    );
    summary = linesAllow ? say.squareRule : say.none;
  }

  const allowed = new Set(reading.options.map((o) => o.value));
  const fitting = rack.filter((tile) => (tile.face === null ? allowed.size > 0 : allowed.has(tile.face)));
  const names = [...new Set(fitting.map((tile) => (tile.face === null ? say.wild : String(tile.face))))];

  return (
    <div className="board-note" role="status">
      <button type="button" className="note-close" onClick={onClose} aria-label={t.close}>
        ×
      </button>
      {lines.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
      <p className="note-summary">{summary}</p>
      {rack.length > 0 && <p className="muted">{names.length ? say.yours(names.join(", ")) : say.noneOfYours}</p>}
    </div>
  );
}

/**
 * The 27 sets of three values that make 15. The values the player holds are in
 * bold, and the sets where they hold two of the three stand out: one tile on
 * the board is then all they need.
 */
function TriosSheet({ rack }: { rack: readonly Tile[] }) {
  const { t } = useI18n();
  const faces = rack.flatMap((tile) => (tile.face === null ? [] : [tile.face]));
  const wild = rack.some((tile) => tile.face === null);
  return (
    <details className="sheet" open>
      <summary>{t.teach.sheetTitle}</summary>
      <p className="muted small">{t.teach.sheetHint}</p>
      <ul className="sheet-grid">
        {TRIOS_OF_15.map((combo) => {
          // Match each value against a tile in hand, each tile once.
          const pool = [...faces];
          const held = combo.map((v) => {
            const i = pool.indexOf(v);
            if (i < 0) return false;
            pool.splice(i, 1);
            return true;
          });
          const count = held.filter(Boolean).length;
          // From the rack alone: all three in hand, or two and the wild (one wild per move).
          const whole = rack.length >= 3 && (count === 3 || (count === 2 && wild));
          return (
            <li key={combo.join()} className={count >= 2 ? "uses" : undefined}>
              {combo.map((v, i) => (
                <span key={i}>
                  {i > 0 && " + "}
                  {held[i] ? <b>{v}</b> : v}
                </span>
              ))}
              {whole && <span className="star"> ★</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Ideas({
  analysis,
  rack,
  onPreview,
}: {
  analysis: Analysis | null;
  rack: readonly Tile[];
  onPreview: (placements: Placement[]) => void;
}) {
  const { t } = useI18n();
  if (!analysis) return <p className="thinking">{t.teach.thinking}</p>;
  if (analysis.ideas.length === 0) return <p>{t.teach.noMove}</p>;
  const { greedy } = analysis;
  return (
    <ol className="ideas">
      {analysis.ideas.slice(0, 2).map((idea, i) => {
        const top = greedy !== null && sameMove(idea, greedy);
        return (
          <li key={i} className="idea">
            <div className="idea-head">
              <span className="recap-move">
                <MiniTiles tiles={moveTiles(idea.placements, rack)} />
                {t.recap.scored(idea.score)}
              </span>
              <button type="button" className="btn small-btn" onClick={() => onPreview(idea.placements)}>
                {t.teach.show}
              </button>
            </div>
            {top && <p className="muted small">{t.teach.topScore}</p>}
            <p className="muted small">{t.teach.replyAbout(Math.round(idea.reply))}</p>
            <Reasons items={reasons(idea, top ? null : greedy)} />
          </li>
        );
      })}
    </ol>
  );
}

function ReviewNote({ review, onCompare }: { review: Review; onCompare: () => void }) {
  const { t } = useI18n();
  const { analysis, played, position } = review;
  if (!analysis) return <p className="thinking">{t.teach.reviewing}</p>;
  const best = analysis.ideas[0];
  if (!played) {
    if (!best) return <p className="review">{t.teach.nothingPossible}</p>;
    return (
      <div className="review">
        <p>
          {t.teach.couldPlay}{" "}
          <span className="recap-move">
            <MiniTiles tiles={moveTiles(best.placements, position.rack)} />
            {t.recap.scored(best.score)}
          </span>
        </p>
        <button type="button" className="btn small-btn" onClick={onCompare}>
          {t.teach.compare}
        </button>
      </div>
    );
  }
  const mine = analysis.included;
  if (!mine || !best) return null;
  const verdict = sameMove(mine, best) ? "best" : grade(mine, best);
  // A best move that isn't the top scorer: say why it was the better choice.
  const smart = verdict === "best" && analysis.greedy && !sameMove(mine, analysis.greedy) ? reasons(mine, analysis.greedy) : [];
  return (
    <div className={`review grade-${verdict}`}>
      <p className="review-grade">{t.teach.grade[verdict]}</p>
      {verdict === "best" ? (
        smart.length > 0 && (
          <>
            <p className="muted small">{t.teach.smartChoice}</p>
            <Reasons items={smart} />
          </>
        )
      ) : (
        <>
          <p>
            {t.teach.coachWould}{" "}
            <span className="recap-move">
              <MiniTiles tiles={moveTiles(best.placements, position.rack)} />
              {t.recap.scored(best.score)}
            </span>
          </p>
          <Reasons items={reasons(best, mine)} />
          <button type="button" className="btn small-btn" onClick={onCompare}>
            {t.teach.compare}
          </button>
        </>
      )}
    </div>
  );
}

/** The position before the player's move, with their move or the coach's idea drawn on it. */
function CompareDialog({ review, onClose }: { review: Review; onClose: () => void }) {
  const { t } = useI18n();
  const { position, played, analysis } = review;
  const best = analysis?.ideas[0];
  const [showing, setShowing] = useState<"mine" | "coach">(played ? "mine" : "coach");
  const placements = showing === "mine" && played ? played : (best?.placements ?? []);
  const tiles = moveTiles(placements, position.rack);
  const pending = new Map<number, PendingTile>(placements.map((p, i) => [p.cell, tiles[i]]));
  return (
    <Modal title={t.teach.compareTitle} onDismiss={onClose} className="compare">
      {played && (
        <div className="actions">
          {(["mine", "coach"] as const).map((which) => (
            <button
              key={which}
              type="button"
              className={`btn small-btn${showing === which ? " primary" : ""}`}
              aria-pressed={showing === which}
              onClick={() => setShowing(which)}
            >
              {which === "mine" ? t.teach.yourMove : t.teach.coachMove}
            </button>
          ))}
        </div>
      )}
      <Board
        board={position.board}
        pending={pending}
        pendingValid={showing === "coach"}
        lastCells={NONE}
        errorCells={NONE}
        interactive={false}
        onCell={() => {}}
        onDropTile={() => {}}
      />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          {t.close}
        </button>
      </div>
    </Modal>
  );
}

interface TeachingPanelProps {
  view: GameView;
  /** Ideas, square reading and what fits: only where they can't tip a game against other people. */
  liveHelp: boolean;
  canAct: boolean;
  marks: boolean;
  onMarks: (on: boolean) => void;
  review: Review | null;
  onPreview: (placements: Placement[]) => void;
}

export function TeachingPanel({ view, liveHelp, canAct, marks, onMarks, review, onPreview }: TeachingPanelProps) {
  const { t } = useI18n();
  const [teaching, setTeaching] = useTeaching();
  const [ideas, setIdeas] = useState<{ version: number; analysis: Analysis | null } | null>(null);
  const [comparing, setComparing] = useState(false);

  if (!teaching) {
    return (
      <section className="area-teach">
        <button type="button" className="btn ghost teach-on" onClick={() => setTeaching(true)}>
          {t.teach.turnOn}
        </button>
      </section>
    );
  }

  // Ideas belong to the position they were asked for.
  const shown = ideas && ideas.version === view.version ? ideas : null;
  const askIdea = () => {
    const position = positionOf(view);
    if (!position) return;
    const version = view.version;
    setIdeas({ version, analysis: null });
    void runCoach(position).then((analysis) =>
      setIdeas((current) => (current?.version === version ? { version, analysis } : current)),
    );
  };
  const myReview = review && review.seat === view.seat ? review : null;
  const playing = view.status === "playing";

  return (
    <section className="area-teach panel">
      <div className="teach-head">
        <h3>{t.teach.title}</h3>
        <button type="button" className="btn ghost small-btn" onClick={() => setTeaching(false)}>
          {t.teach.turnOff}
        </button>
      </div>
      <p className="muted small">{liveHelp ? t.teach.intro : t.teach.onlineNote}</p>
      {liveHelp && playing && (
        <div className="actions">
          {canAct && (
            <button
              type="button"
              className="btn small-btn"
              onClick={askIdea}
              disabled={shown !== null && !shown.analysis}
            >
              {t.teach.askIdea}
            </button>
          )}
          <button type="button" className="btn small-btn" aria-pressed={marks} onClick={() => onMarks(!marks)}>
            {marks ? t.teach.hideMarks : t.teach.showMarks}
          </button>
        </div>
      )}
      {liveHelp && shown && <Ideas analysis={shown.analysis} rack={view.rack} onPreview={onPreview} />}
      {myReview && <ReviewNote review={myReview} onCompare={() => setComparing(true)} />}
      {view.seat !== null && playing && <TriosSheet rack={view.rack} />}
      {comparing && myReview?.analysis && <CompareDialog review={myReview} onClose={() => setComparing(false)} />}
    </section>
  );
}
