import { BOARD_SIZE, CELL_COUNT, CENTRE, MAX_VALUE, RACK_SIZE } from "./types";
import type { PlacedTile, Placement, Tile } from "./types";
import { neighbours, rowOf } from "./board";
import { evaluatePlacement, isBoardEmpty, type Evaluation, type PlacementRules } from "./rules";

export interface Candidate {
  placements: Placement[];
  evaluation: Extract<Evaluation, { ok: true }>;
}

type Board = readonly (PlacedTile | null)[];

/**
 * Every set of empty cells a move could fill: 1 to 3 cells in one line whose
 * span is closed by placed tiles at both ends, touching the existing tiles.
 */
function* cellSets(board: Board, maxTiles: number, boardEmpty: boolean): Generator<number[]> {
  const touches = (cell: number) =>
    boardEmpty ? cell === CENTRE : neighbours(cell).some((n) => board[n] !== null);
  for (const horizontal of [true, false]) {
    const step = horizontal ? 1 : BOARD_SIZE;
    for (let start = 0; start < CELL_COUNT; start++) {
      if (board[start] !== null) continue;
      for (let len = horizontal ? 1 : 2; len <= 3; len++) {
        const end = start + (len - 1) * step;
        if (end >= CELL_COUNT || (horizontal && rowOf(end) !== rowOf(start))) break;
        if (board[end] !== null) continue;
        const empties: number[] = [];
        for (let c = start; c <= end; c += step) if (board[c] === null) empties.push(c);
        if (empties.length > maxTiles || !empties.some(touches)) continue;
        yield empties;
      }
    }
  }
}

function* arrangements(size: number, k: number, used: number[] = []): Generator<number[]> {
  if (used.length === k) {
    yield used;
    return;
  }
  for (let i = 0; i < size; i++) {
    if (!used.includes(i)) yield* arrangements(size, k, [...used, i]);
  }
}

const WILD_VALUES = Array.from({ length: MAX_VALUE + 1 }, (_, v) => v);

export interface MoveSearch extends Omit<PlacementRules, "boardEmpty"> {
  /** Stop once this many legal moves are found. */
  limit?: number;
}

/** All legal placements for `rack`. */
export function generateMoves(board: Board, rack: readonly Tile[], { limit = Infinity, ...rules }: MoveSearch = {}): Candidate[] {
  const boardEmpty = isBoardEmpty(board);
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const maxTiles = Math.min(RACK_SIZE, rack.length);
  for (const cells of cellSets(board, maxTiles, boardEmpty)) {
    for (const order of arrangements(rack.length, cells.length)) {
      const tiles = order.map((i) => rack[i]);
      if (tiles.filter((t) => t.face === null).length > 1) continue;
      const hasWild = tiles.some((t) => t.face === null);
      for (const wildValue of hasWild ? WILD_VALUES : [undefined]) {
        // Two tiles with the same face give the same move: only try it once.
        const key = cells
          .map((cell, i) => `${cell}:${tiles[i].face ?? `w${wildValue}`}`)
          .join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const placements: Placement[] = cells.map((cell, i) =>
          tiles[i].face === null ? { tileId: tiles[i].id, cell, value: wildValue } : { tileId: tiles[i].id, cell },
        );
        const evaluation = evaluatePlacement(board, rack, placements, { ...rules, boardEmpty });
        if (evaluation.ok) {
          out.push({ placements, evaluation });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

export const hasAnyMove = (board: Board, rack: readonly Tile[], rules: Omit<MoveSearch, "limit"> = {}) =>
  rack.length > 0 && generateMoves(board, rack, { ...rules, limit: 1 }).length > 0;

/**
 * True when no tile of any value fits anywhere. Checking single tiles is
 * enough: adding tiles to a line only tightens the limits on each cell.
 */
export function isBoardDead(board: Board): boolean {
  if (isBoardEmpty(board)) return false;
  const probe: Tile[] = [{ id: -1, face: null }];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (board[cell] !== null || !neighbours(cell).some((n) => board[n] !== null)) continue;
    for (const value of WILD_VALUES) {
      if (evaluatePlacement(board, probe, [{ tileId: -1, cell, value }], { boardEmpty: false }).ok) return false;
    }
  }
  return true;
}
