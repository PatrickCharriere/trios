import { MAX_PLAYERS, MIN_PLAYERS, RACK_SIZE, type GameView, type Move, type Placement } from "@/engine";

/** Shapes shared by the API routes and the browser client. */

export const TOKEN_HEADER = "x-trios-token";
export const MAX_NAME = 20;

export interface Snapshot {
  id: string;
  rev: number;
  seats: number;
  names: string[];
  /** The caller's seat, or null for a visitor without a seat. */
  seat: number | null;
  started: boolean;
  view: GameView | null;
}

export interface SeatGrant {
  id: string;
  token: string;
  seat: number;
  snapshot: Snapshot;
}

export type PollResult = { unchanged: true; rev: number } | { unchanged?: false; snapshot: Snapshot };

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

export function cleanSeats(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) >= MIN_PLAYERS && (raw as number) <= MAX_PLAYERS
    ? (raw as number)
    : null;
}

const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Checks the shape of a move sent over the wire; the engine checks the rules. */
export function parseMove(raw: unknown): Move | null {
  if (!raw || typeof raw !== "object") return null;
  const move = raw as Record<string, unknown>;
  if (move.type === "pass") return { type: "pass" };
  if (move.type === "exchange") {
    const ids = move.tileIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > RACK_SIZE || !ids.every(isInt)) return null;
    return { type: "exchange", tileIds: ids };
  }
  if (move.type === "place") {
    const list = move.placements;
    if (!Array.isArray(list) || list.length === 0 || list.length > RACK_SIZE) return null;
    const placements: Placement[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") return null;
      const { tileId, cell, value } = item as Record<string, unknown>;
      if (!isInt(tileId) || !isInt(cell) || (value !== undefined && !isInt(value))) return null;
      placements.push(value === undefined ? { tileId, cell } : { tileId, cell, value });
    }
    return { type: "place", placements };
  }
  return null;
}

/** Accepts a bare code or a pasted game link. */
export function extractGameId(input: string): string | null {
  const match = input.trim().match(/(?:\/g\/)?([a-z0-9]{4,12})\/?$/i);
  return match ? match[1].toLowerCase() : null;
}
