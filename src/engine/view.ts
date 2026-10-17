import type { EndReason, GameState, LogEntry, PlacedTile, Player, Tile } from "./types";
import { inFirstRound } from "./rules";

/** What one seat is allowed to see: other racks and the bag order stay hidden. */
export interface GameView {
  version: number;
  board: (PlacedTile | null)[];
  bagCount: number;
  rackCounts: number[];
  seat: number | null;
  rack: Tile[];
  players: Player[];
  current: number;
  turn: number;
  status: GameState["status"];
  /** No square of four tiles may be formed until everyone has had a turn. */
  firstRound: boolean;
  log: LogEntry[];
  endReason?: EndReason;
  finalBonus?: GameState["finalBonus"];
  winners?: number[];
  /** Revealed once the game is over. */
  racks?: Tile[][];
  /** The tiles set aside at the start, revealed once the game is over. */
  aside?: Tile[];
}

const LOG_LIMIT = 30;

/**
 * What the other players have done since `seat` last played, oldest first:
 * the moves to point out when it is that player's turn again.
 */
export function sinceLastTurn(log: readonly LogEntry[], seat: number | null): LogEntry[] {
  if (seat === null) return [];
  let start = log.length;
  while (start > 0 && log[start - 1].player !== seat) start--;
  return log.slice(start);
}

export function viewFor(state: GameState, seat: number | null): GameView {
  const over = state.status === "over";
  return {
    version: state.version,
    board: state.board,
    bagCount: state.bag.length,
    rackCounts: state.racks.map((r) => r.length),
    seat,
    rack: seat === null ? [] : state.racks[seat],
    players: state.players,
    current: state.current,
    turn: state.turn,
    status: state.status,
    firstRound: inFirstRound(state),
    log: state.log.slice(-LOG_LIMIT),
    endReason: state.endReason,
    finalBonus: state.finalBonus,
    winners: state.winners,
    racks: over ? state.racks : undefined,
    aside: over ? state.aside : undefined,
  };
}
