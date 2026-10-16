export const BOARD_SIZE = 15;
export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE;
export const CENTRE = Math.floor(CELL_COUNT / 2);
export const RACK_SIZE = 3;
export const TARGET = 15;
export const MAX_VALUE = 15;
export const TRIO_BONUS = 15;
export const TRIOLET_BONUS = 50;
export const SET_ASIDE = 3;
/** Exchanging is only allowed while the bag still holds at least this many tiles. */
export const EXCHANGE_MIN_BAG = 5;
/** The game stops after this many full rounds in which nobody places a tile. */
export const SCORELESS_ROUNDS = 2;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** A tile in the bag or on a rack. A wild tile has no face value until it is placed. */
export interface Tile {
  id: number;
  face: number | null;
}

/** A tile on the board. Wilds keep the value chosen when they were placed. */
export interface PlacedTile {
  id: number;
  value: number;
  wild: boolean;
  player: number;
  turn: number;
}

export type Square = "plain" | "double" | "triple" | "replay" | "centre";

export interface Placement {
  tileId: number;
  cell: number;
  /** Required for a wild tile, ignored otherwise. */
  value?: number;
}

export type Move =
  | { type: "place"; placements: Placement[] }
  | { type: "exchange"; tileIds: number[] }
  | { type: "pass" };

export type BotLevel = "easy" | "normal" | "hard";

export interface Player {
  name: string;
  kind: "human" | "bot";
  level?: BotLevel;
  score: number;
}

export interface ScoredGroup {
  cells: number[];
  sum: number;
  trio: boolean;
  multiplier: number;
  points: number;
}

export type LogEntry =
  | {
      type: "place";
      player: number;
      cells: number[];
      score: number;
      groups: ScoredGroup[];
      triolet: boolean;
      replay: boolean;
    }
  | { type: "exchange"; player: number; count: number }
  | { type: "pass"; player: number };

export type EndReason = "out" | "blocked" | "stalled";

export interface GameState {
  version: number;
  board: (PlacedTile | null)[];
  bag: Tile[];
  racks: Tile[][];
  players: Player[];
  current: number;
  turn: number;
  /** Consecutive turns without a tile placed (passes and exchanges). */
  scoreless: number;
  status: "playing" | "over";
  log: LogEntry[];
  endReason?: EndReason;
  /** Points the player who went out collected from the other racks. */
  finalBonus?: { player: number; points: number };
  winners?: number[];
}

export type RuleError =
  | "gameOver"
  | "notYourTurn"
  | "empty"
  | "tooMany"
  | "notInRack"
  | "duplicateTile"
  | "outOfBounds"
  | "occupied"
  | "duplicateCell"
  | "notInLine"
  | "gap"
  | "notConnected"
  | "mustCoverCentre"
  | "wildValue"
  | "twoWilds"
  | "tooLong"
  | "pairOver"
  | "trioNot15"
  | "exchangeEmpty"
  | "exchangeBagLow";
