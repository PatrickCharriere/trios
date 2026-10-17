"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BOARD_SIZE, CELL_COUNT, CENTRE, LAYOUT, colOf, rowOf, type PlacedTile, type Square } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { TileFace } from "./TileFace";

const SQUARE_MARK: Record<Square, string> = {
  plain: "",
  double: "×2",
  triple: "×3",
  replay: "↻",
  centre: "★",
};

export interface PendingTile {
  value: number | null;
  wild: boolean;
}

/**
 * Teaching mode's label for an open square: the value a trio needs, the most a
 * pair allows or ✕; or, on the danger map, the most the next player could score there.
 */
export interface SquareMark {
  label: string;
  kind: "trio" | "pair" | "blocked" | "danger";
  /** One of the player's tiles can go here. */
  fits?: boolean;
  /** How strongly a danger square stands out, from 1 to 3. */
  level?: 1 | 2 | 3;
  /** What a screen reader says for the label. */
  spoken: string;
}

interface BoardProps {
  board: readonly (PlacedTile | null)[];
  pending: ReadonlyMap<number, PendingTile>;
  pendingValid: boolean;
  lastCells: ReadonlySet<number>;
  errorCells: ReadonlySet<number>;
  interactive: boolean;
  onCell: (cell: number) => void;
  onDropTile: (cell: number, tileId: number) => void;
  marks?: ReadonlyMap<number, SquareMark>;
  /** Squares to point at: the one being read, or the tiles of a move picked in the history. */
  focusCells?: ReadonlySet<number>;
  /** Empty squares can be tapped even when no tile can be placed (to read them in teaching mode). */
  inspectable?: boolean;
}

const CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i);
const NONE: ReadonlySet<number> = new Set();

export function Board({
  board,
  pending,
  pendingValid,
  lastCells,
  errorCells,
  interactive,
  onCell,
  onDropTile,
  marks,
  focusCells = NONE,
  inspectable = false,
}: BoardProps) {
  const { t } = useI18n();
  const squareName: Record<Square, string> = {
    plain: "",
    double: t.game.legendDouble,
    triple: t.game.legendTriple,
    replay: t.game.legendReplay,
    centre: t.game.legendCentre,
  };

  // One tab stop for the whole board; arrow keys move between cells.
  const [focusCell, setFocusCell] = useState(CENTRE);
  const boardRef = useRef<HTMLDivElement>(null);
  const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -BOARD_SIZE, ArrowDown: BOARD_SIZE };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = STEPS[e.key];
    if (step === undefined) return;
    const next = focusCell + step;
    const leavesRow = Math.abs(step) === 1 && rowOf(next) !== rowOf(focusCell);
    if (next < 0 || next >= CELL_COUNT || leavesRow) return;
    e.preventDefault();
    setFocusCell(next);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus();
  };

  return (
    <div className="board-frame">
      <div className="board" role="group" aria-label={t.game.board} ref={boardRef} onKeyDown={onKeyDown}>
        {CELLS.map((cell) => {
          const placed = board[cell];
          const draft = pending.get(cell);
          const square = LAYOUT[cell];
          const mark = !placed && !draft ? marks?.get(cell) : undefined;
          const label = [
            t.game.cellLabel(rowOf(cell) + 1, colOf(cell) + 1),
            squareName[square],
            placed ? String(placed.value) : draft ? String(draft.value ?? "") : "",
            mark?.spoken ?? "",
          ]
            .filter(Boolean)
            .join(", ");
          const classes = ["cell", `sq-${square}`];
          if (lastCells.has(cell)) classes.push("last");
          if (errorCells.has(cell)) classes.push("error");
          if (focusCells.has(cell)) classes.push("focus");
          const clickable = interactive || (inspectable && !placed);
          return (
            <button
              key={cell}
              type="button"
              data-cell={cell}
              tabIndex={cell === focusCell ? 0 : -1}
              className={classes.join(" ")}
              aria-label={label}
              // Not `disabled`: occupied cells must stay focusable for arrow-key travel.
              aria-disabled={!clickable || !!placed}
              onFocus={() => setFocusCell(cell)}
              onClick={() => clickable && onCell(cell)}
              onDragOver={(e) => {
                if (interactive && !placed && !draft) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                if (!Number.isNaN(id)) onDropTile(cell, id);
              }}
            >
              {placed ? (
                <TileFace value={placed.value} wild={placed.wild} />
              ) : draft ? (
                <TileFace value={draft.value} wild={draft.wild} state={pendingValid ? "valid" : "pending"} />
              ) : mark ? (
                <span
                  className={`hint hint-${mark.kind}${mark.fits ? " fits" : ""}${mark.level ? ` level-${mark.level}` : ""}`}
                  aria-hidden="true"
                >
                  {mark.label}
                </span>
              ) : (
                <span className="mark" aria-hidden="true">
                  {SQUARE_MARK[square]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
