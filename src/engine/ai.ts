import { EXCHANGE_MIN_BAG, MAX_VALUE, TARGET } from "./types";
import type { BotLevel, GameState, Move, PlacedTile } from "./types";
import { LAYOUT, cellAt, colOf, inBounds, multiplierOf, rowOf } from "./board";
import { generateMoves, type Candidate } from "./movegen";
import type { Rng } from "./tiles";

/**
 * Rough cost of the openings a move leaves behind: every new pair that an
 * opponent could finish into a trio, weighted by the square they would use.
 */
function openingPenalty(board: readonly (PlacedTile | null)[], candidate: Candidate): number {
  const filled = (r: number, c: number) =>
    board[cellAt(r, c)] !== null || candidate.evaluation.cells.includes(cellAt(r, c));
  let penalty = 0;
  for (const group of candidate.evaluation.groups) {
    if (group.cells.length !== 2) continue;
    const need = TARGET - group.sum;
    if (need < 0 || need > MAX_VALUE) continue;
    const [a, b] = group.cells;
    const dr = rowOf(b) - rowOf(a);
    const dc = colOf(b) - colOf(a);
    const ends: [number, number, number][] = [
      [rowOf(a), colOf(a), -1],
      [rowOf(b), colOf(b), 1],
    ];
    for (const [r, c, dir] of ends) {
      const er = r + dir * dr;
      const ec = c + dir * dc;
      if (!inBounds(er, ec) || filled(er, ec)) continue;
      // A tile beyond the open end would make a run of four, so it is not a real opening.
      if (inBounds(er + dir * dr, ec + dir * dc) && filled(er + dir * dr, ec + dir * dc)) continue;
      const square = LAYOUT[cellAt(er, ec)];
      const m = multiplierOf(square);
      penalty += m === 1 ? 2 : 8 * m;
      if (square === "replay") penalty += 6;
    }
  }
  return penalty;
}

function usesWild(state: GameState, player: number, candidate: Candidate) {
  const rack = state.racks[player];
  return candidate.placements.some((p) => rack.find((t) => t.id === p.tileId)?.face === null);
}

function fallback(state: GameState, player: number): Move {
  const rack = state.racks[player];
  if (state.bag.length >= EXCHANGE_MIN_BAG && rack.length > 0) {
    return { type: "exchange", tileIds: rack.map((t) => t.id) };
  }
  return { type: "pass" };
}

export function chooseMove(state: GameState, player: number, level: BotLevel, rng: Rng = Math.random): Move {
  const moves = generateMoves(state.board, state.racks[player]);
  if (moves.length === 0) return fallback(state, player);

  const rate = (c: Candidate) => {
    let value = c.evaluation.score;
    // Spending a wild on a small score wastes it.
    if (level !== "easy" && usesWild(state, player, c) && c.evaluation.score < 30) value -= 12;
    if (level === "hard") value += (c.evaluation.replay ? 10 : 0) - openingPenalty(state.board, c);
    return value;
  };
  const ranked = moves
    .map((c) => ({ c, value: rate(c) + rng() * 0.5 }))
    .sort((a, b) => b.value - a.value);

  let pick: Candidate;
  if (level === "hard") {
    pick = ranked[0].c;
  } else if (level === "normal") {
    pick = ranked[Math.floor(rng() * Math.min(3, ranked.length))].c;
  } else {
    // Easy: anything from the weaker half of the legal moves.
    const half = ranked.slice(Math.floor(ranked.length / 2));
    pick = half[Math.floor(rng() * half.length)].c;
  }
  return { type: "place", placements: pick.placements };
}
