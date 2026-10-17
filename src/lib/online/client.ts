import type { Move } from "@/engine";
import { TOKEN_HEADER, type PollResult, type SeatGrant, type Snapshot } from "./protocol";

export class ApiFailure extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function call<T>(path: string, options: { body?: unknown; token?: string | null } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { [TOKEN_HEADER]: options.token } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiFailure("network", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(data?.error ?? "network", response.status);
  return data as T;
}

export const api = {
  config: () => call<{ online: boolean }>("/api/config"),
  create: (name: string, seats: number) => call<SeatGrant>("/api/games", { body: { name, seats } }),
  poll: (id: string, token: string | null, since?: number) =>
    call<PollResult>(`/api/games/${id}${since ? `?since=${since}` : ""}`, { token }),
  join: (id: string, name: string) => call<SeatGrant>(`/api/games/${id}/join`, { body: { name } }),
  start: (id: string, token: string) => call<Snapshot>(`/api/games/${id}/start`, { body: {}, token }),
  move: (id: string, token: string, move: Move) => call<Snapshot>(`/api/games/${id}/move`, { body: { move }, token }),
  rematch: (id: string, token: string) => call<Snapshot>(`/api/games/${id}/rematch`, { body: {}, token }),
};

const FAST_POLL_MS = 1500;
const SLOW_POLL_MS = 8000;
const HIDDEN_POLL_MS = 6000;
const HIDDEN_LATER_POLL_MS = 60_000;
const HIDDEN_SLOWER_AFTER_MS = 10 * 60_000;
const HIDDEN_STOP_AFTER_MS = 2 * 60 * 60_000;

/**
 * How long a game page waits before checking for news again, or null to stop
 * until the page is in view again. `waiting` is true while the others play (or
 * before the game starts); `hiddenFor` is how long the tab has been in the
 * background, or null when it's in view. In view: every 1.5 s while waiting,
 * every 8 s on the player's own turn, as nothing changes on the server then.
 * In the background, only while waiting, so the your-turn chime still comes:
 * every 6 s, every minute after ten minutes, and not at all after two hours,
 * so a forgotten tab can't use up the store's free quota.
 */
export function pollDelay(waiting: boolean, hiddenFor: number | null): number | null {
  if (hiddenFor === null) return waiting ? FAST_POLL_MS : SLOW_POLL_MS;
  if (!waiting || hiddenFor >= HIDDEN_STOP_AFTER_MS) return null;
  return hiddenFor < HIDDEN_SLOWER_AFTER_MS ? HIDDEN_POLL_MS : HIDDEN_LATER_POLL_MS;
}

const SEATS_KEY = "trios.seats.v1";

export interface SavedSeat {
  token: string;
  seat: number;
}

/** Fallback when the browser blocks storage, so the host keeps their seat after creating a game. */
const memorySeats: Record<string, SavedSeat> = {};

function readSeats(): Record<string, SavedSeat> {
  try {
    return { ...memorySeats, ...JSON.parse(window.localStorage.getItem(SEATS_KEY) ?? "{}") };
  } catch {
    return { ...memorySeats };
  }
}

export const loadSeat = (id: string): SavedSeat | null => readSeats()[id] ?? null;

/** Every online game this browser holds a seat in. */
export const listSeatIds = (): string[] => Object.keys(readSeats());

export function saveSeat(id: string, seat: SavedSeat) {
  memorySeats[id] = seat;
  try {
    window.localStorage.setItem(SEATS_KEY, JSON.stringify({ ...readSeats(), [id]: seat }));
  } catch {
    // The seat then only lasts for this page view.
  }
}

const NAME_KEY = "trios.name";

export function loadName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered, that's all.
  }
}
