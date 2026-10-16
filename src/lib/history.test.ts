import { beforeEach, describe, expect, it } from "vitest";
import { createGame, seededRng } from "@/engine";
import {
  MAX_FINISHED_LOCAL,
  createLocalGame,
  gameHref,
  getHistory,
  latestOpenGame,
  loadLocalGame,
  markOnlineExpired,
  recordOnlineGame,
  removeGame,
  resetHistoryCache,
  saveLocalGame,
  visibleGames,
} from "./history";
import type { Snapshot } from "./online/protocol";

class MemoryStorage {
  data = new Map<string, string>();
  full = false;
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => {
    if (this.full) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(k, v);
  };
  removeItem = (k: string) => void this.data.delete(k);
}

let store: MemoryStorage;
const solo = [
  { name: "Ana", kind: "human" as const },
  { name: "Robot 1", kind: "bot" as const, level: "easy" as const },
];

beforeEach(() => {
  store = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: store,
    addEventListener() {},
    removeEventListener() {},
  };
  resetHistoryCache();
});

describe("local game history", () => {
  it("creates, lists, saves and reloads games by id", () => {
    const a = createLocalGame("solo", solo);
    const b = createLocalGame("local", [solo[0], { name: "Bob", kind: "human" }]);
    expect(a).not.toBe(b);
    expect(getHistory().map((g) => g.id).sort()).toEqual([a, b].sort());

    const game = loadLocalGame(a)!;
    expect(game.mode).toBe("solo");
    game.state.players[0].score = 42;
    saveLocalGame(game);

    resetHistoryCache(); // as if the page were reloaded
    const summary = getHistory().find((g) => g.id === a)!;
    expect(summary.players[0]).toEqual({ name: "Ana", score: 42, bot: false });
    expect(summary.players[1].bot).toBe(true);
    expect(getHistory()[0].id).toBe(a); // most recently updated first
    expect(loadLocalGame(a)!.state.players[0].score).toBe(42);
    expect(gameHref(summary)).toBe(`/play/${a}`);
  });

  it("finds the latest open game and drops removed ones", () => {
    const a = createLocalGame("solo", solo);
    const b = createLocalGame("solo", solo);
    const finished = loadLocalGame(b)!;
    finished.state.status = "over";
    finished.state.winners = [0];
    saveLocalGame(finished);
    expect(latestOpenGame(getHistory())?.id).toBe(a);

    removeGame(a);
    expect(loadLocalGame(a)).toBeNull();
    expect(getHistory().map((g) => g.id)).toEqual([b]);
    expect(latestOpenGame(getHistory())).toBeNull();
  });

  it("imports the single save of the previous version once", () => {
    store.setItem("trios.local.v1", JSON.stringify({ setup: solo, state: createGame(solo, seededRng(1)) }));
    const [imported] = getHistory();
    expect(imported.mode).toBe("solo");
    expect(loadLocalGame(imported.id)).not.toBeNull();
    expect(store.getItem("trios.local.v1")).toBeNull();
    resetHistoryCache();
    expect(getHistory()).toHaveLength(1);
  });

  it("ignores saves from an older game format", () => {
    store.setItem("trios.game.old", JSON.stringify({ id: "old", mode: "solo", state: { board: [] } }));
    expect(loadLocalGame("old")).toBeNull();
  });

  it("keeps only the most recent finished games", () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_FINISHED_LOCAL + 3; i++) {
      const id = createLocalGame("solo", solo);
      const game = loadLocalGame(id)!;
      game.state.status = "over";
      game.state.winners = [0];
      saveLocalGame(game);
      ids.push(id);
    }
    const kept = getHistory().filter((g) => g.status === "over");
    expect(kept).toHaveLength(MAX_FINISHED_LOCAL);
    expect(loadLocalGame(ids[0])).toBeNull();
    expect(loadLocalGame(ids.at(-1)!)).not.toBeNull();
  });

  it("keeps working in memory when storage is full or blocked", () => {
    store.full = true;
    const id = createLocalGame("solo", solo);
    expect(loadLocalGame(id)).not.toBeNull();
    expect(getHistory().map((g) => g.id)).toContain(id);
  });
});

describe("online game history", () => {
  const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
    id: "abc234",
    rev: 1,
    seats: 2,
    names: ["Ana"],
    seat: 0,
    started: false,
    view: null,
    ...over,
  });

  it("records lobbies and games, and marks expired ones", () => {
    recordOnlineGame(snapshot());
    expect(getHistory()[0]).toMatchObject({ mode: "online", status: "lobby", seats: 2, seat: 0 });

    const state = createGame([{ name: "Ana", kind: "human" }, { name: "Bob", kind: "human" }], seededRng(4));
    recordOnlineGame(
      snapshot({
        started: true,
        names: ["Ana", "Bob"],
        view: {
          version: 0,
          board: state.board,
          bagCount: state.bag.length,
          rackCounts: [3, 3],
          seat: 0,
          rack: state.racks[0],
          players: state.players,
          current: 1,
          turn: 0,
          status: "playing",
          firstRound: true,
          log: [],
        },
      }),
    );
    expect(getHistory()[0]).toMatchObject({ status: "playing", current: 1, players: [{ name: "Ana" }, { name: "Bob" }] });
    expect(gameHref(getHistory()[0])).toBe("/g/abc234");

    markOnlineExpired("abc234");
    expect(getHistory()[0]).toMatchObject({ status: "expired", current: null });
  });

  it("hides removed online games until their link is opened again", () => {
    recordOnlineGame(snapshot());
    removeGame("abc234");
    expect(visibleGames(getHistory())).toHaveLength(0);
    expect(latestOpenGame(getHistory())).toBeNull();
    // Opening the game again records a fresh snapshot, which brings it back.
    recordOnlineGame(snapshot({ names: ["Ana", "Bob"] }));
    expect(visibleGames(getHistory()).map((g) => g.id)).toEqual(["abc234"]);
  });

  it("ignores snapshots for games this browser has no seat in", () => {
    recordOnlineGame(snapshot({ seat: null }));
    expect(getHistory()).toHaveLength(0);
  });
});
