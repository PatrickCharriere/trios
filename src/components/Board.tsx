"use client";

import { BOARD_SIZE, CELL_COUNT, LAYOUT, colOf, rowOf, type PlacedTile, type Square } from "@/engine";
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

  return (
    <div className="board" role="grid" aria-rowcount={BOARD_SIZE} aria-colcount={BOARD_SIZE}>
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
            role="gridcell"
            className={classes.join(" ")}
            aria-label={label}
            disabled={!interactive || !!placed}
            onClick={() => onCell(cell)}
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
  );
}
