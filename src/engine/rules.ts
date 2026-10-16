import { BOARD_SIZE, CELL_COUNT, CENTRE, MAX_VALUE, RACK_SIZE, TARGET, TRIOLET_BONUS, TRIO_BONUS } from "./types";
import type { GameState, PlacedTile, Placement, RuleError, ScoredGroup, Tile } from "./types";
import { LAYOUT, cellAt, colOf, multiplierOf, neighbours, rowOf } from "./board";

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

/** Rules that depend on the state of the game rather than on the board alone. */
export interface PlacementRules {
  /** Precomputed isBoardEmpty(board), to save work in the move generator. */
  boardEmpty?: boolean;
  /** The first round is on: no move may form a square (a 2x2 block) of tiles. */
  noSquares?: boolean;
}

/**
 * The first round lasts until every player has had a turn; a play again turn
 * doesn't end it. Gigamic's rules: "Lors du premier tour, il est interdit de
 * former un carré avec les premiers jetons", to keep the game open.
 */
export const inFirstRound = (state: Pick<GameState, "log" | "players">) =>
  new Set(state.log.map((entry) => entry.player)).size < state.players.length;

/** A size x size block of occupied cells that includes one of `cells`, if any. */
function blockThrough(cells: readonly number[], occupied: (cell: number) => boolean, size: number): number[] | null {
  for (const cell of cells) {
    for (let top = rowOf(cell) - size + 1; top <= rowOf(cell); top++) {
      for (let left = colOf(cell) - size + 1; left <= colOf(cell); left++) {
        if (top < 0 || left < 0 || top + size > BOARD_SIZE || left + size > BOARD_SIZE) continue;
        const block: number[] = [];
        for (let r = top; r < top + size; r++) for (let c = left; c < left + size; c++) block.push(cellAt(r, c));
        if (block.every(occupied)) return block;
      }
    }
  }
  return null;
}

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
  rules: PlacementRules = {},
): Evaluation {
  const boardEmpty = rules.boardEmpty ?? isBoardEmpty(board);
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
  // A wild counts its chosen value towards 15 but scores nothing ("sa valeur est nulle pour le comptage des points").
  const pointsAt = (cell: number) => {
    const tile = placed.get(cell) ?? board[cell];
    return tile && !tile.wild ? tile.value : 0;
  };

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

  const sumOf = (run: number[]) => run.reduce((total, c) => total + valueAt(c), 0);
  for (const run of runs.values()) {
    if (run.length > 3) return fail("tooLong", run);
    if (run.length === 2 && sumOf(run) > TARGET) return fail("pairOver", run);
    if (run.length === 3 && sumOf(run) !== TARGET) return fail("trioNot15", run);
  }

  // Never a full 3x3 block: nothing could ever be placed beside it, so it
  // would block the game ("il est interdit de former un carré de 3 par 3").
  const bigSquare = blockThrough(cells, occupied, 3);
  if (bigSquare) return fail("bigSquare", bigSquare);
  // No 2x2 block at the start: in the first round (Gigamic) or with the first
  // four tiles (tournament rules), whichever lasts longer.
  const square = blockThrough(cells, occupied, 2);
  if (square && (rules.noSquares || board.filter(Boolean).length < 4)) return fail("earlySquare", square);

  // Premium squares only count for tiles placed this turn: a square used
  // earlier is spent, even if a later tile completes a trio through it.
  const squareOf = (c: number) => (placed.has(c) ? multiplierOf(LAYOUT[c]) : 1);
  const groups: ScoredGroup[] = [];
  for (const run of runs.values()) {
    const sum = sumOf(run);
    if (run.length === 3) {
      // A trio is always worth 15 plus the 15 bonus, wild or not, and a trio
      // completed this turn is multiplied as a whole.
      const multiplier = run.reduce((m, c) => m * squareOf(c), 1);
      groups.push({ cells: run, sum, trio: true, multiplier, points: (TARGET + TRIO_BONUS) * multiplier });
    } else {
      // In a pair, a premium square only multiplies the tile sitting on it.
      const points = run.reduce((total, c) => total + pointsAt(c) * squareOf(c), 0);
      groups.push({ cells: run, sum, trio: false, multiplier: 1, points });
    }
  }

  // A lone tile only happens on the opening move; it scores its own value.
  if (groups.length === 0) {
    const cell = cells[0];
    const multiplier = multiplierOf(LAYOUT[cell]);
    groups.push({ cells: [cell], sum: valueAt(cell), trio: false, multiplier, points: pointsAt(cell) * multiplier });
  }

  const triolet =
    placements.length === 3 &&
    wilds === 0 &&
    groups.some((g) => g.trio && g.cells.every((c) => placed.has(c)));
  const replay = cells.some((c) => LAYOUT[c] === "replay");
  const score = groups.reduce((total, g) => total + g.points, 0) + (triolet ? TRIOLET_BONUS : 0);

  return { ok: true, cells, groups, triolet, replay, score };
}
