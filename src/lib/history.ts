import { createGame, type GameState, type PlayerSetup } from "@/engine";
import type { Snapshot } from "./online/protocol";

/**
 * Every game this browser knows about, for the home page lists. Local games
 * (against bots or pass and play) are stored whole, one storage key each;
 * online games live on the server, so only a summary is kept here and the
 * seat token stays in the online client's own store.
 */

export type GameMode = "solo" | "local" | "online";
export type GameStatus = "lobby" | "playing" | "over" | "expired";

export interface GameSummary {
  id: string;
  mode: GameMode;
  createdAt: number;
  updatedAt: number;
  status: GameStatus;
  players: { name: string; score: number; bot: boolean }[];
  /** Whose turn it is while the game is on. */
  current: number | null;
  winners: number[];
  /** Online games: the seat this browser holds. */
  seat: number | null;
  seats: number;
  /**
   * Online games removed from the list are only hidden: the seat is kept, so
   * opening the game's link again still lets this browser play, and brings it back.
   */
  hidden?: boolean;
}

export interface LocalGame {
  id: string;
  mode: "solo" | "local";
  createdAt: number;
  setup: PlayerSetup[];
  state: GameState;
}

const INDEX_KEY = "trios.history.v1";
const GAME_PREFIX = "trios.game.";
const LEGACY_KEY = "trios.local.v1";
/** Finished local games kept before the oldest are dropped, so storage never fills up. */
export const MAX_FINISHED_LOCAL = 40;

const EMPTY: GameSummary[] = [];
let index: GameSummary[] | null = null;
// Fallbacks for when the browser blocks storage: games then last for this visit.
let memoryIndex: GameSummary[] = [];
const memoryGames = new Map<string, LocalGame>();
const listeners = new Set<() => void>();

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

function read<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function drop(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}

const byRecent = (a: GameSummary, b: GameSummary) => b.updatedAt - a.updatedAt;

function isLocalGame(game: unknown): game is LocalGame {
  const g = game as LocalGame | null;
  // Saves written by an older version of the game state are ignored rather than crashing.
  return !!g?.id && Array.isArray(g.state?.board) && g.state.board.length > 0 && typeof g.state.scoreless === "number";
}

export function newGameId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export function summariseLocal(game: LocalGame, updatedAt: number): GameSummary {
  const { state } = game;
  return {
    id: game.id,
    mode: game.mode,
    createdAt: game.createdAt,
    updatedAt,
    status: state.status,
    players: state.players.map((p) => ({ name: p.name, score: p.score, bot: p.kind === "bot" })),
    current: state.status === "playing" ? state.current : null,
    winners: state.winners ?? [],
    seat: null,
    seats: state.players.length,
  };
}

/** Imports the single saved game of the previous version, once. */
function migrateLegacy(list: GameSummary[]): GameSummary[] {
  const legacy = read<{ setup: PlayerSetup[]; state: GameState }>(LEGACY_KEY);
  if (!legacy) return list;
  drop(LEGACY_KEY);
  const game = {
    id: newGameId(),
    mode: legacy.setup?.some((p) => p.kind === "bot") ? "solo" : "local",
    createdAt: Date.now(),
    setup: legacy.setup,
    state: legacy.state,
  } as LocalGame;
  if (!isLocalGame(game)) return list;
  write(GAME_PREFIX + game.id, game);
  memoryGames.set(game.id, game);
  return [summariseLocal(game, game.createdAt), ...list];
}

function load(): GameSummary[] {
  if (index) return index;
  const stored = read<GameSummary[]>(INDEX_KEY);
  const list = Array.isArray(stored) ? stored : memoryIndex;
  const migrated = migrateLegacy(list);
  index = [...migrated].sort(byRecent);
  if (migrated !== list) write(INDEX_KEY, index);
  return index;
}

function commit(next: GameSummary[]) {
  index = [...next].sort(byRecent);
  memoryIndex = index;
  write(INDEX_KEY, index);
  listeners.forEach((listener) => listener());
}

/** Inserts or replaces a summary; skips the write when nothing but the time changed. */
function upsert(summary: GameSummary) {
  const list = load();
  const existing = list.find((g) => g.id === summary.id);
  const same = (a: GameSummary, b: GameSummary) =>
    JSON.stringify({ ...a, updatedAt: 0, createdAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0, createdAt: 0 });
  if (existing && same(existing, summary)) return;
  const merged = existing ? { ...summary, createdAt: existing.createdAt } : summary;
  commit([merged, ...list.filter((g) => g.id !== summary.id)]);
}

/** Drops the oldest finished local games beyond the limit. */
function prune() {
  const finished = load().filter((g) => g.mode !== "online" && g.status === "over");
  const extra = finished.slice(MAX_FINISHED_LOCAL);
  if (extra.length === 0) return;
  for (const g of extra) {
    drop(GAME_PREFIX + g.id);
    memoryGames.delete(g.id);
  }
  const gone = new Set(extra.map((g) => g.id));
  commit(load().filter((g) => !gone.has(g.id)));
}

export function subscribeHistory(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === INDEX_KEY || e.key === null) {
      index = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const getHistory = (): GameSummary[] => load();
export const getServerHistory = (): GameSummary[] => EMPTY;

export function loadLocalGame(id: string): LocalGame | null {
  const stored = read<LocalGame>(GAME_PREFIX + id);
  if (isLocalGame(stored)) return stored;
  return memoryGames.get(id) ?? null;
}

export function saveLocalGame(game: LocalGame) {
  memoryGames.set(game.id, game);
  if (!write(GAME_PREFIX + game.id, game)) {
    // Storage may be full: make room by dropping old finished games, then try once more.
    prune();
    write(GAME_PREFIX + game.id, game);
  }
  upsert(summariseLocal(game, Date.now()));
  if (game.state.status === "over") prune();
}

export function createLocalGame(mode: LocalGame["mode"], setup: PlayerSetup[]): string {
  const game: LocalGame = { id: newGameId(), mode, createdAt: Date.now(), setup, state: createGame(setup) };
  saveLocalGame(game);
  return game.id;
}

export function summariseOnline(snapshot: Snapshot, updatedAt: number): GameSummary {
  const view = snapshot.view;
  return {
    id: snapshot.id,
    mode: "online",
    createdAt: updatedAt,
    updatedAt,
    status: view ? view.status : "lobby",
    players: view
      ? view.players.map((p) => ({ name: p.name, score: p.score, bot: false }))
      : snapshot.names.map((name) => ({ name, score: 0, bot: false })),
    current: view?.status === "playing" ? view.current : null,
    winners: view?.winners ?? [],
    seat: snapshot.seat,
    seats: snapshot.seats,
  };
}

/** Records what this browser last saw of an online game it has a seat in. */
export function recordOnlineGame(snapshot: Snapshot) {
  if (snapshot.seat === null) return;
  upsert(summariseOnline(snapshot, Date.now()));
}

/** The server no longer has the game (it expired after two weeks without a move). */
export function markOnlineExpired(id: string) {
  const existing = load().find((g) => g.id === id);
  if (existing && existing.status !== "expired") upsert({ ...existing, status: "expired", current: null, updatedAt: Date.now() });
}

/** Deletes a local game; hides an online one (see GameSummary.hidden). */
export function removeGame(id: string) {
  const existing = load().find((g) => g.id === id);
  if (existing?.mode === "online") {
    commit(load().map((g) => (g.id === id ? { ...g, hidden: true } : g)));
    return;
  }
  drop(GAME_PREFIX + id);
  memoryGames.delete(id);
  commit(load().filter((g) => g.id !== id));
}

/** The games to show: everything except online games the player removed from the list. */
export const visibleGames = (list: GameSummary[]) => list.filter((g) => !g.hidden);

/** The most recently played game that is still going, if any. */
export const latestOpenGame = (list: GameSummary[]) =>
  visibleGames(list).find((g) => g.status === "playing" || g.status === "lobby") ?? null;

export const gameHref = (g: Pick<GameSummary, "id" | "mode">) => (g.mode === "online" ? `/g/${g.id}` : `/play/${g.id}`);

/** For tests: forget the cached index so the next read goes back to storage. */
export function resetHistoryCache() {
  index = null;
  memoryIndex = [];
  memoryGames.clear();
}
