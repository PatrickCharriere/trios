import { BOARD_SIZE, CELL_COUNT, CENTRE, MAX_VALUE, RACK_SIZE, TARGET, TRIOLET_BONUS, TRIO_BONUS } from "./types";
import type { PlacedTile, Placement, RuleError, ScoredGroup, Tile } from "./types";
import { LAYOUT, colOf, multiplierOf, neighbours, rowOf } from "./board";

export type Evaluation =
  | {
      ok: true;
      cells: number[];
      groups: ScoredGroup[];
      triolet: boolean;
      replay: boolean;
      score: number;
    }
  | { ok: false; error: RuleError; cells?: number[] };

type Board = readonly (PlacedTile | null)[];

const fail = (error: RuleError, cells?: number[]): Evaluation => ({ ok: false, error, cells });

export const isBoardEmpty = (board: Board) => board.every((t) => t === null);

/** The maximal line of occupied cells through `cell`, in board order. */
function runThrough(cell: number, horizontal: boolean, occupied: (cell: number) => boolean): number[] {
  const step = horizontal ? 1 : BOARD_SIZE;
  const sameLine = (a: number, b: number) => (horizontal ? rowOf(a) === rowOf(b) : true);
  let start = cell;
  while (start - step >= 0 && sameLine(start - step, cell) && occupied(start - step)) start -= step;
  const run: number[] = [];
  for (let c = start; c < CELL_COUNT && sameLine(c, cell) && occupied(c); c += step) run.push(c);
  return run;
}

/**
 * Checks a set of tiles placed from `rack` against the rules and scores it.
 * Pure: neither the board nor the rack is modified.
 */
export function evaluatePlacement(
  board: Board,
  rack: readonly Tile[],
  placements: readonly Placement[],
  boardEmpty = isBoardEmpty(board),
): Evaluation {
  if (placements.length === 0) return fail("empty");
  if (placements.length > RACK_SIZE) return fail("tooMany");

  const placed = new Map<number, { value: number; wild: boolean }>();
  const usedTiles = new Set<number>();
  let wilds = 0;
  for (const p of placements) {
    const tile = rack.find((t) => t.id === p.tileId);
    if (!tile) return fail("notInRack");
    if (usedTiles.has(p.tileId)) return fail("duplicateTile");
    usedTiles.add(p.tileId);
    if (!Number.isInteger(p.cell) || p.cell < 0 || p.cell >= CELL_COUNT) return fail("outOfBounds");
    if (board[p.cell]) return fail("occupied", [p.cell]);
    if (placed.has(p.cell)) return fail("duplicateCell", [p.cell]);
    let value: number;
    if (tile.face === null) {
      wilds++;
      if (p.value === undefined || !Number.isInteger(p.value) || p.value < 0 || p.value > MAX_VALUE) {
        return fail("wildValue", [p.cell]);
      }
      value = p.value;
    } else {
      value = tile.face;
    }
    placed.set(p.cell, { value, wild: tile.face === null });
  }
  if (wilds > 1) return fail("twoWilds");

  const cells = [...placed.keys()].sort((a, b) => a - b);
  const occupied = (cell: number) => placed.has(cell) || board[cell] !== null;
  const valueAt = (cell: number) => placed.get(cell)?.value ?? board[cell]?.value ?? 0;

  if (cells.length > 1) {
    const sameRow = cells.every((c) => rowOf(c) === rowOf(cells[0]));
    const sameCol = cells.every((c) => colOf(c) === colOf(cells[0]));
    if (!sameRow && !sameCol) return fail("notInLine", cells);
    const step = sameRow ? 1 : BOARD_SIZE;
    for (let c = cells[0]; c <= cells[cells.length - 1]; c += step) {
      if (!occupied(c)) return fail("gap", cells);
    }
  }

  if (boardEmpty) {
    if (!placed.has(CENTRE)) return fail("mustCoverCentre", cells);
  } else if (!cells.some((c) => neighbours(c).some((n) => board[n] !== null))) {
    return fail("notConnected", cells);
  }

  const runs = new Map<string, number[]>();
  for (const cell of cells) {
    for (const horizontal of [true, false]) {
      const run = runThrough(cell, horizontal, occupied);
      if (run.length >= 2) runs.set(`${horizontal ? "h" : "v"}${run[0]}`, run);
    }
  }

  const groups: ScoredGroup[] = [];
  for (const run of runs.values()) {
    const sum = run.reduce((total, c) => total + valueAt(c), 0);
    if (run.length > 3) return fail("tooLong", run);
    if (run.length === 2 && sum > TARGET) return fail("pairOver", run);
    if (run.length === 3 && sum !== TARGET) return fail("trioNot15", run);
    const trio = run.length === 3;
    const multiplier = run
      .filter((c) => placed.has(c))
      .reduce((m, c) => m * multiplierOf(LAYOUT[c]), 1);
    groups.push({ cells: run, sum, trio, multiplier, points: (sum + (trio ? TRIO_BONUS : 0)) * multiplier });
  }

  // A lone tile only happens on the opening move; it scores its own value.
  if (groups.length === 0) {
    const cell = cells[0];
    const multiplier = multiplierOf(LAYOUT[cell]);
    const sum = valueAt(cell);
    groups.push({ cells: [cell], sum, trio: false, multiplier, points: sum * multiplier });
  }

  const triolet =
    placements.length === 3 &&
    wilds === 0 &&
    groups.some((g) => g.trio && g.cells.every((c) => placed.has(c)));
  const replay = cells.some((c) => LAYOUT[c] === "replay");
  const score = groups.reduce((total, g) => total + g.points, 0) + (triolet ? TRIOLET_BONUS : 0);

  return { ok: true, cells, groups, triolet, replay, score };
}
