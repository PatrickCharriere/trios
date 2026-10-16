import { BOARD_SIZE, CELL_COUNT, CENTRE, type Square } from "./types";

export const rowOf = (cell: number) => Math.floor(cell / BOARD_SIZE);
export const colOf = (cell: number) => cell % BOARD_SIZE;
export const cellAt = (row: number, col: number) => row * BOARD_SIZE + col;
export const inBounds = (row: number, col: number) =>
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

export function neighbours(cell: number): number[] {
  const r = rowOf(cell);
  const c = colOf(cell);
  const out: number[] = [];
  if (r > 0) out.push(cell - BOARD_SIZE);
  if (r < BOARD_SIZE - 1) out.push(cell + BOARD_SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < BOARD_SIZE - 1) out.push(cell + 1);
  return out;
}

/**
 * Special squares, given for one eighth of the board (row <= col <= 7) and
 * mirrored into the other seven. The official board's exact layout could not
 * be verified, so this is a balanced approximation: edit it here if your
 * physical board differs.
 */
const OCTANT: [number, number, Square][] = [
  [0, 0, "triple"],
  [0, 7, "triple"],
  [5, 5, "triple"],
  [2, 2, "double"],
  [3, 7, "double"],
  [6, 6, "double"],
  [2, 7, "replay"],
  [4, 6, "replay"],
];

function buildLayout(): Square[] {
  const squares: Square[] = Array(CELL_COUNT).fill("plain");
  const last = BOARD_SIZE - 1;
  for (const [r, c, kind] of OCTANT) {
    const images: [number, number][] = [
      [r, c],
      [c, r],
      [r, last - c],
      [last - c, r],
      [last - r, c],
      [c, last - r],
      [last - r, last - c],
      [last - c, last - r],
    ];
    for (const [ir, ic] of images) squares[cellAt(ir, ic)] = kind;
  }
  squares[CENTRE] = "centre";
  return squares;
}

export const LAYOUT: readonly Square[] = buildLayout();

/** The centre square counts as a double. */
export function multiplierOf(square: Square): number {
  if (square === "triple") return 3;
  if (square === "double" || square === "centre") return 2;
  return 1;
}
