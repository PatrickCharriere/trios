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

const SEATS_KEY = "trios.seats.v1";

export interface SavedSeat {
  token: string;
  seat: number;
}

function readSeats(): Record<string, SavedSeat> {
  try {
    return JSON.parse(window.localStorage.getItem(SEATS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const loadSeat = (id: string): SavedSeat | null => readSeats()[id] ?? null;

export function saveSeat(id: string, seat: SavedSeat) {
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
