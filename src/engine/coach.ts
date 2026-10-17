import { BOARD_SIZE, CELL_COUNT, CENTRE, MAX_VALUE, TARGET } from "./types";
import type { PlacedTile, Placement, Tile } from "./types";
import { cellAt, colOf, neighbours, rowOf } from "./board";
import { evaluatePlacement, isBoardEmpty } from "./rules";
import { generateMoves, type Candidate } from "./movegen";
import { openingPenalty } from "./ai";
import { makeTileSet, seededRng, type Rng } from "./tiles";

/**
 * The coach: reads what fits on a square, and looks for the moves that are
 * worth most once the next player's reply and the state of the board are
 * counted, not just the points scored now. It only uses what the player can
 * see: the board, their own rack, and how many tiles the next player holds.
 */

type Board = readonly (PlacedTile | null)[];

const VALUES = Array.from({ length: MAX_VALUE + 1 }, (_, v) => v);
const PROBES: Tile[] = VALUES.map((face) => ({ id: -1, face }));

/** Every set of three values that makes 15, smallest first: 0 + 0 + 15 up to 5 + 5 + 5 (27 in all). */
export const TRIOS_OF_15: readonly (readonly [number, number, number])[] = VALUES.flatMap((a) =>
  VALUES.filter((b) => b >= a && TARGET - a - b >= b).map((b) => [a, b, TARGET - a - b] as const),
);

/** What one line through an empty square asks of a tile placed there. */
export type LineNeed =
  | { kind: "trio"; value: number }
  | { kind: "pair"; max: number }
  | { kind: "blocked"; reason: "tooLong" | "tooHigh" };

export interface LineReading {
  horizontal: boolean;
  /** The tiles the square would join, in board order; null marks the square itself. */
  run: (number | null)[];
  sum: number;
  need: LineNeed;
}

export interface SquareOption {
  value: number;
  points: number;
  trio: boolean;
}

export interface SquareReading {
  cell: number;
  lines: LineReading[];
  /** Values that may go here on their own, with the points each scores. */
  options: SquareOption[];
}

export function lineNeed(run: readonly (number | null)[], sum: number): LineNeed {
  if (run.length > 3) return { kind: "blocked", reason: "tooLong" };
  if (sum > TARGET) return { kind: "blocked", reason: "tooHigh" };
  return run.length === 3 ? { kind: "trio", value: TARGET - sum } : { kind: "pair", max: TARGET - sum };
}

function linesThrough(board: Board, cell: number): LineReading[] {
  const lines: LineReading[] = [];
  for (const horizontal of [true, false]) {
    const [dr, dc] = horizontal ? [0, 1] : [1, 0];
    const collect = (dir: number) => {
      const values: number[] = [];
      let r = rowOf(cell) + dir * dr;
      let c = colOf(cell) + dir * dc;
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[cellAt(r, c)]) {
        values.push(board[cellAt(r, c)]!.value);
        r += dir * dr;
        c += dir * dc;
      }
      return values;
    };
    const before = collect(-1).reverse();
    const after = collect(1);
    if (before.length + after.length === 0) continue;
    const run = [...before, null, ...after];
    const sum = [...before, ...after].reduce((a, b) => a + b, 0);
    lines.push({ horizontal, run, sum, need: lineNeed(run, sum) });
  }
  return lines;
}

/** Whether a single tile could ever be placed on this empty square: it touches a tile, or it is the opening square. */
function reachable(board: Board, cell: number, boardEmpty: boolean) {
  if (board[cell]) return false;
  return boardEmpty ? cell === CENTRE : neighbours(cell).some((n) => board[n] !== null);
}

/**
 * What a single tile would do on an empty square: the lines it would join and
 * every value allowed there, with its points. Null for a square no tile can reach.
 */
export function readSquare(board: Board, cell: number, { firstRound = false } = {}): SquareReading | null {
  const boardEmpty = isBoardEmpty(board);
  if (!reachable(board, cell, boardEmpty)) return null;
  const options: SquareOption[] = [];
  for (const value of VALUES) {
    const evaluation = evaluatePlacement(board, [PROBES[value]], [{ tileId: -1, cell }], {
      boardEmpty,
      noSquares: firstRound,
    });
    if (evaluation.ok) {
      options.push({ value, points: evaluation.score, trio: evaluation.groups.some((g) => g.trio) });
    }
  }
  return { cell, lines: linesThrough(board, cell), options };
}

/** Every square a single tile can reach, read as above. */
export function readBoard(board: Board, rules: { firstRound?: boolean } = {}): SquareReading[] {
  const out: SquareReading[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const reading = readSquare(board, cell, rules);
    if (reading) out.push(reading);
  }
  return out;
}

/**
 * How many squares next to the tiles can still take a tile: a measure of how
 * open the board is. The first round's ban on squares of four is temporary, so
 * it is left out here.
 */
export function openSquares(board: Board): number {
  if (isBoardEmpty(board)) return 1;
  let open = 0;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (!reachable(board, cell, false)) continue;
    const fits = VALUES.some(
      (value) => evaluatePlacement(board, [PROBES[value]], [{ tileId: -1, cell }], { boardEmpty: false }).ok,
    );
    if (fits) open++;
  }
  return open;
}

/** How many 2 x 2 blocks of tiles include one of `cells`. */
export function squaresFormed(occupied: (cell: number) => boolean, cells: readonly number[]): number {
  const blocks = new Set<number>();
  for (const cell of cells) {
    for (let top = rowOf(cell) - 1; top <= rowOf(cell); top++) {
      for (let left = colOf(cell) - 1; left <= colOf(cell); left++) {
        if (top < 0 || left < 0 || top + 1 >= BOARD_SIZE || left + 1 >= BOARD_SIZE) continue;
        const corners = [cellAt(top, left), cellAt(top, left + 1), cellAt(top + 1, left), cellAt(top + 1, left + 1)];
        if (corners.every(occupied)) blocks.add(cellAt(top, left));
      }
    }
  }
  return blocks.size;
}

/** The position the coach looks at, as the player sees it. */
export interface CoachPosition {
  board: Board;
  rack: readonly Tile[];
  /** The first round is on: no square of four tiles may be formed yet. */
  firstRound: boolean;
  /** How many tiles the next player holds. */
  nextRack: number;
  /** The tiles this player can't see; by default every tile not on the board or their rack. */
  unseen?: readonly Tile[];
}

export interface Idea {
  placements: Placement[];
  cells: number[];
  score: number;
  replay: boolean;
  triolet: boolean;
  /** Spends a wild. */
  wild: boolean;
  /** The next player's best reply, averaged over the racks they might hold. */
  reply: number;
  /** How many more squares can take a tile after the move than before (negative when it closes the board). */
  open: number;
  /** Squares of four tiles the move forms. */
  squares: number;
  /** What the ideas are ranked by: points now, minus the reply, plus or minus what it does to the board. */
  value: number;
}

export interface Analysis {
  /** Best first. */
  ideas: Idea[];
  /** The move that scores most right now, rated the same way. */
  greedy: Idea | null;
  /** The move passed as `include`, rated the same way (null if it isn't legal). */
  included: Idea | null;
}

export interface CoachOptions {
  /** How many moves get the full look ahead (besides the top scorer and `include`). */
  shortlist?: number;
  /** How many racks to try for the next player. */
  samples?: number;
  /** A move to rate alongside the coach's ideas, such as the one the player made. */
  include?: readonly Placement[];
  /** Fixes the racks tried; by default they follow from the position, so the same position gets the same advice. */
  seed?: number;
}

// Rough worth, in points, of the things a move gives or costs besides its score.
const REPLAY_VALUE = 20;
const WILD_COST = 12;
const WILD_CHEAP_BELOW = 40;
const OPEN_VALUE = 1;
const SQUARE_COST = 6;

const spendsWild = (c: Candidate) => c.placements.some((p) => p.value !== undefined);

function staticValue(board: Board, c: Candidate): number {
  const { score, replay, cells } = c.evaluation;
  const occupied = (cell: number) => board[cell] !== null || cells.includes(cell);
  return (
    score +
    (replay ? REPLAY_VALUE : 0) -
    openingPenalty(board, c) -
    SQUARE_COST * squaresFormed(occupied, cells) -
    (spendsWild(c) && score < WILD_CHEAP_BELOW ? WILD_COST : 0)
  );
}

/** A move as cells and values, so moves with different but identical tiles compare equal. */
function moveKey(placements: readonly Placement[], rack: readonly Tile[]): string {
  return placements
    .map((p) => `${p.cell}:${rack.find((t) => t.id === p.tileId)?.face ?? `w${p.value}`}`)
    .sort()
    .join(",");
}

function boardAfter(board: Board, rack: readonly Tile[], c: Candidate): (PlacedTile | null)[] {
  const next = board.slice();
  for (const p of c.placements) {
    const tile = rack.find((t) => t.id === p.tileId)!;
    next[p.cell] = { id: tile.id, value: tile.face ?? p.value!, wild: tile.face === null, player: -1, turn: -1 };
  }
  return next;
}

function hashPosition(position: CoachPosition): number {
  let h = 2166136261;
  const mix = (n: number) => {
    h ^= n + 1;
    h = Math.imul(h, 16777619);
  };
  position.board.forEach((t, cell) => {
    if (t) {
      mix(cell);
      mix(t.value);
    }
  });
  position.rack.forEach((t) => mix(t.face ?? 99));
  return h >>> 0;
}

/** Racks the next player might hold, drawn from the tiles this player can't see. */
function sampleRacks(position: CoachPosition, count: number, rng: Rng): Tile[][] {
  const seen = new Set<number>([
    ...position.board.flatMap((t) => (t ? [t.id] : [])),
    ...position.rack.map((t) => t.id),
  ]);
  const unseen = position.unseen ?? makeTileSet().filter((t) => !seen.has(t.id));
  const size = Math.min(position.nextRack, unseen.length);
  const racks: Tile[][] = [];
  for (let i = 0; i < count && size > 0; i++) {
    const pool = unseen.slice();
    for (let k = 0; k < size; k++) {
      const j = k + Math.floor(rng() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    racks.push(pool.slice(0, size));
  }
  return racks;
}

function bestScore(board: Board, rack: readonly Tile[], firstRound: boolean): number {
  let best = 0;
  for (const c of generateMoves(board, rack, { noSquares: firstRound })) best = Math.max(best, c.evaluation.score);
  return best;
}

/**
 * Ranks the player's possible moves. Every legal move gets a quick look; the
 * most promising few, the top scorer and `include` then get the full one: the
 * next player's best reply is worked out for each sampled rack, and what the
 * move does to the board is measured: squares opened or closed, squares of four formed.
 */
export function analyse(position: CoachPosition, options: CoachOptions = {}): Analysis {
  const steps = analysisSteps(position, options);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * The same analysis in small steps: it pauses after each rack tried, so a page
 * can run it a slice at a time and stay responsive.
 */
export function* analysisSteps(position: CoachPosition, options: CoachOptions = {}): Generator<void, Analysis> {
  const { shortlist = 5, samples = 16 } = options;
  const moves = generateMoves(position.board, position.rack, { noSquares: position.firstRound });
  if (moves.length === 0) return { ideas: [], greedy: null, included: null };
  yield;

  const ranked = moves
    .map((c) => ({ c, value: staticValue(position.board, c) }))
    .sort((a, b) => b.value - a.value)
    .map((r) => r.c);
  const greedy = moves.reduce((best, c) => (c.evaluation.score > best.evaluation.score ? c : best));
  const chosen = new Set<Candidate>(ranked.slice(0, shortlist));
  chosen.add(greedy);
  const includeKey = options.include && moveKey(options.include, position.rack);
  const included = includeKey ? moves.find((c) => moveKey(c.placements, position.rack) === includeKey) : undefined;
  if (included) chosen.add(included);

  const racks = sampleRacks(position, samples, seededRng(options.seed ?? hashPosition(position)));
  const openBefore = openSquares(position.board);

  function* rate(c: Candidate): Generator<void, Idea> {
    const after = boardAfter(position.board, position.rack, c);
    const cache = new Map<string, number>();
    let replyTotal = 0;
    for (const rack of racks) {
      const key = rack.map((t) => t.face ?? "w").sort().join();
      let best = cache.get(key);
      if (best === undefined) {
        best = bestScore(after, rack, position.firstRound);
        cache.set(key, best);
        yield;
      }
      replyTotal += best;
    }
    const { score, replay, triolet, cells } = c.evaluation;
    const reply = racks.length ? replyTotal / racks.length : 0;
    const open = openSquares(after) - openBefore;
    const squares = squaresFormed((cell) => after[cell] !== null, cells);
    const wild = spendsWild(c);
    const value =
      score +
      (replay ? REPLAY_VALUE : 0) -
      reply +
      OPEN_VALUE * open -
      SQUARE_COST * squares -
      (wild && score < WILD_CHEAP_BELOW ? WILD_COST : 0);
    return { placements: c.placements, cells, score, replay, triolet, wild, reply, open, squares, value };
  }

  const rated = new Map<Candidate, Idea>();
  for (const c of chosen) rated.set(c, yield* rate(c));
  return {
    ideas: [...rated.values()].sort((a, b) => b.value - a.value),
    greedy: rated.get(greedy) ?? null,
    included: included ? (rated.get(included) ?? null) : null,
  };
}

/** Why `idea` beats `other`, most telling first. */
export type Reason =
  | { kind: "points"; more: number }
  | { kind: "safer"; reply: number; otherReply: number }
  | { kind: "keepsOpen"; open: number; otherOpen: number }
  | { kind: "noSquare" }
  | { kind: "keepsWild" }
  | { kind: "replay" }
  | { kind: "triolet" };

/** Differences worth pointing out: a reply this much lower, this many more squares left open. */
const SAFER_BY = 5;
const OPEN_BY = 2;

export function reasons(idea: Idea, other: Idea | null): Reason[] {
  const out: Reason[] = [];
  if (idea.triolet && !other?.triolet) out.push({ kind: "triolet" });
  if (other && idea.score > other.score) out.push({ kind: "points", more: idea.score - other.score });
  if (other && other.reply - idea.reply >= SAFER_BY) {
    out.push({ kind: "safer", reply: Math.round(idea.reply), otherReply: Math.round(other.reply) });
  }
  if (other && idea.open - other.open >= OPEN_BY) {
    out.push({ kind: "keepsOpen", open: idea.open, otherOpen: other.open });
  }
  if (other && other.squares > 0 && idea.squares === 0) out.push({ kind: "noSquare" });
  if (other && other.wild && !idea.wild) out.push({ kind: "keepsWild" });
  if (idea.replay && !other?.replay) out.push({ kind: "replay" });
  return out;
}

/** How close a move came to the coach's best idea, for the review after a move. */
export type Grade = "best" | "good" | "fair" | "weak";

export function grade(move: Idea, best: Idea): Grade {
  const gap = best.value - move.value;
  if (gap <= 3) return "best";
  if (gap <= 12) return "good";
  if (gap <= 30) return "fair";
  return "weak";
}
