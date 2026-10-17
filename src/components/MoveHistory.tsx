"use client";

import { useState } from "react";
import type { GameView, PlacedTile } from "@/engine";
import { useI18n } from "@/i18n/I18nProvider";
import { MiniTiles } from "./TileFace";

/** How many of the latest moves show before the list is opened up. */
const COLLAPSED = 8;

/** The tiles a move put on these squares, as they are on the board now. */
export const tilesAt = (board: readonly (PlacedTile | null)[], cells: readonly number[]) =>
  cells.flatMap((cell) => {
    const tile = board[cell];
    return tile ? [{ value: tile.value, wild: tile.wild }] : [];
  });

interface MoveHistoryProps {
  view: GameView;
  /** Position in the log of the move shown on the board, if any. */
  selected: number | null;
  onSelect: (index: number | null) => void;
}

/** Every move of the game, latest first; tap one to find its tiles on the board. */
export function MoveHistory({ view, selected, onSelect }: MoveHistoryProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const entries = view.log.map((entry, index) => ({ entry, index })).reverse();
  if (entries.length === 0) return <p className="muted small">{t.game.noMoves}</p>;
  const shown = open ? entries : entries.slice(0, COLLAPSED);

  return (
    <>
      <p className="muted small">{t.game.historyHint}</p>
      <ol className={`log${open ? " open" : ""}`}>
        {shown.map(({ entry, index }) => {
          const name = view.players[entry.player]?.name ?? "";
          const number = <span className="log-n">{index + 1}</span>;
          if (entry.type !== "place") {
            return (
              <li key={index} className="log-row muted">
                {number}
                <span>{entry.type === "exchange" ? t.log.exchange(name, entry.count) : t.log.pass(name)}</span>
              </li>
            );
          }
          const active = selected === index;
          return (
            <li key={index}>
              <button
                type="button"
                className={`log-row log-move${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => onSelect(active ? null : index)}
              >
                {number}
                <span className="log-name">{name}</span>
                <MiniTiles tiles={tilesAt(view.board, entry.cells)} />
                <span className="log-points">{t.log.points(entry.score)}</span>
                {entry.triolet && <span className="tag">Triolet</span>}
                {entry.replay && <span className="tag">↻</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {entries.length > COLLAPSED && (
        <button type="button" className="btn ghost small-btn" onClick={() => setOpen(!open)}>
          {open ? t.history.showLess : t.history.showAll(entries.length)}
        </button>
      )}
    </>
  );
}
