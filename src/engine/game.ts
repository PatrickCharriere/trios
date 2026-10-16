import { CELL_COUNT, EXCHANGE_MIN_BAG, MAX_PLAYERS, MIN_PLAYERS, RACK_SIZE, SCORELESS_ROUNDS, SET_ASIDE } from "./types";
import type { BotLevel, EndReason, GameState, Move, RuleError } from "./types";
import { makeTileSet, rackValue, shuffle, type Rng } from "./tiles";
import { evaluatePlacement, inFirstRound } from "./rules";
import { hasAnyMove, isBoardDead } from "./movegen";

export interface PlayerSetup {
  name: string;
  kind: "human" | "bot";
  level?: BotLevel;
}

export type MoveResult = { ok: true; state: GameState } | { ok: false; error: RuleError };

export function createGame(setup: PlayerSetup[], rng: Rng = Math.random): GameState {
  if (setup.length < MIN_PLAYERS || setup.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  // Three tiles go back in the box unseen, so nobody can count the bag exactly.
  const bag = shuffle(makeTileSet(), rng).slice(SET_ASIDE);
  const racks = setup.map(() => bag.splice(bag.length - RACK_SIZE, RACK_SIZE));
  return {
    version: 0,
    board: Array(CELL_COUNT).fill(null),
    bag,
    racks,
    players: setup.map((p) => ({ ...p, score: 0 })),
    current: Math.floor(rng() * setup.length),
    turn: 0,
    scoreless: 0,
    status: "playing",
    log: [],
  };
}

function draw(state: GameState, player: number, count: number) {
  for (let i = 0; i < count && state.bag.length > 0; i++) {
    state.racks[player].push(state.bag.pop()!);
  }
}

function finish(state: GameState, reason: EndReason, outPlayer?: number) {
  state.status = "over";
  state.endReason = reason;
  if (reason === "out" && outPlayer !== undefined) {
    const points = state.racks.reduce(
      (total, rack, i) => (i === outPlayer ? total : total + rack.reduce((s, t) => s + rackValue(t), 0)),
      0,
    );
    state.players[outPlayer].score += points;
    state.finalBonus = { player: outPlayer, points };
  }
  const best = Math.max(...state.players.map((p) => p.score));
  state.winners = state.players.flatMap((p, i) => (p.score === best ? [i] : []));
}

/** Applies `move` for `player`, returning a new state. The input state is never modified. */
export function applyMove(state: GameState, player: number, move: Move, rng: Rng = Math.random): MoveResult {
  if (state.status !== "playing") return { ok: false, error: "gameOver" };
  if (player !== state.current) return { ok: false, error: "notYourTurn" };

  const next = structuredClone(state);
  const rack = next.racks[player];
  let keepTurn = false;

  if (move.type === "place") {
    const evaluation = evaluatePlacement(next.board, rack, move.placements, { noSquares: inFirstRound(state) });
    if (!evaluation.ok) return { ok: false, error: evaluation.error };
    for (const p of move.placements) {
      const [tile] = rack.splice(rack.findIndex((t) => t.id === p.tileId), 1);
      next.board[p.cell] = {
        id: tile.id,
        value: tile.face ?? p.value!,
        wild: tile.face === null,
        player,
        turn: next.turn,
      };
    }
    next.players[player].score += evaluation.score;
    draw(next, player, move.placements.length);
    next.scoreless = 0;
    next.log.push({
      type: "place",
      player,
      cells: evaluation.cells,
      score: evaluation.score,
      groups: evaluation.groups,
      triolet: evaluation.triolet,
      replay: evaluation.replay,
    });
    if (rack.length === 0 && next.bag.length === 0) finish(next, "out", player);
    keepTurn = evaluation.replay;
  } else if (move.type === "exchange") {
    const ids = new Set(move.tileIds);
    if (ids.size === 0) return { ok: false, error: "exchangeEmpty" };
    if (ids.size !== move.tileIds.length || ![...ids].every((id) => rack.some((t) => t.id === id))) {
      return { ok: false, error: "notInRack" };
    }
    if (next.bag.length < EXCHANGE_MIN_BAG) return { ok: false, error: "exchangeBagLow" };
    const returned = rack.filter((t) => ids.has(t.id));
    next.racks[player] = rack.filter((t) => !ids.has(t.id));
    draw(next, player, returned.length);
    next.bag = shuffle([...next.bag, ...returned], rng);
    next.scoreless += 1;
    next.log.push({ type: "exchange", player, count: returned.length });
  } else {
    next.scoreless += 1;
    next.log.push({ type: "pass", player });
  }

  if (next.status === "playing") {
    if (!keepTurn) next.current = (next.current + 1) % next.players.length;
    const stuck =
      isBoardDead(next.board) ||
      (next.bag.length === 0 && !next.racks.some((r) => hasAnyMove(next.board, r)));
    if (stuck) finish(next, "blocked");
    else if (next.scoreless >= SCORELESS_ROUNDS * next.players.length) finish(next, "stalled");
  }
  next.turn += 1;
  next.version += 1;
  return { ok: true, state: next };
}
