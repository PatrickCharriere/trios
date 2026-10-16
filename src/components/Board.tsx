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

interface BoardProps {
  board: readonly (PlacedTile | null)[];
  pending: ReadonlyMap<number, PendingTile>;
  pendingValid: boolean;
  lastCells: ReadonlySet<number>;
  errorCells: ReadonlySet<number>;
  interactive: boolean;
  onCell: (cell: number) => void;
  onDropTile: (cell: number, tileId: number) => void;
}

const CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i);

export function Board({
  board,
  pending,
  pendingValid,
  lastCells,
  errorCells,
  interactive,
  onCell,
  onDropTile,
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
          const label = [
            t.game.cellLabel(rowOf(cell) + 1, colOf(cell) + 1),
            squareName[square],
            placed ? String(placed.value) : draft ? String(draft.value ?? "") : "",
          ]
            .filter(Boolean)
            .join(", ");
          const classes = ["cell", `sq-${square}`];
          if (lastCells.has(cell)) classes.push("last");
          if (errorCells.has(cell)) classes.push("error");
          return (
            <button
              key={cell}
              type="button"
              data-cell={cell}
              tabIndex={cell === focusCell ? 0 : -1}
              className={classes.join(" ")}
              aria-label={label}
              // Not `disabled`: occupied cells must stay focusable for arrow-key travel.
              aria-disabled={!interactive || !!placed}
              onFocus={() => setFocusCell(cell)}
              onClick={() => interactive && onCell(cell)}
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
