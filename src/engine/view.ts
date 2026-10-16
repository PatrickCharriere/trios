import type { EndReason, GameState, LogEntry, PlacedTile, Player, Tile } from "./types";

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
  log: LogEntry[];
  endReason?: EndReason;
  finalBonus?: GameState["finalBonus"];
  winners?: number[];
  /** Revealed once the game is over. */
  racks?: Tile[][];
}

const LOG_LIMIT = 30;

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
    log: state.log.slice(-LOG_LIMIT),
    endReason: state.endReason,
    finalBonus: state.finalBonus,
    winners: state.winners,
    racks: over ? state.racks : undefined,
  };
}
