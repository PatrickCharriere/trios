import { describe, expect, it } from "vitest";
import { generateMoves } from "@/engine";
import {
  OnlineError,
  createOnlineGame,
  joinOnlineGame,
  playOnlineMove,
  pollOnlineGame,
  rematchOnlineGame,
  startOnlineGame,
} from "./service";
import { cleanName, extractGameId, parseMove, type Snapshot } from "./protocol";
import { findUpstashEnv, memoryStore } from "./store";

const store = memoryStore();

async function rejects(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e) => e instanceof OnlineError && e.code === code);
}

function anyMove(snap: Snapshot) {
  const view = snap.view!;
  const [candidate] = generateMoves(view.board, view.rack, { limit: 1 });
  return { type: "place" as const, placements: candidate.placements };
}

describe("online service", () => {
  it("runs a two player game from creation to moves", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    expect(host.snapshot).toMatchObject({ started: false, names: ["Ana"], seat: 0, view: null });

    const guest = await joinOnlineGame(host.id, "Bob", store);
    expect(guest.seat).toBe(1);
    expect(guest.snapshot.started).toBe(true);
    expect(guest.snapshot.view!.rack).toHaveLength(3);
    // The guest sees how many tiles the host holds, never which ones.
    expect(JSON.stringify(guest.snapshot)).not.toContain(host.token);
    expect(guest.snapshot.view!.rackCounts).toEqual([3, 3]);
    // The tiles set aside stay hidden until the game is over.
    expect(guest.snapshot.view!.aside).toBeUndefined();

    await rejects(joinOnlineGame(host.id, "Cy", store), "started");

    const tokens = [host.token, guest.token];
    const first = await pollOnlineGame(host.id, host.token, null, store);
    if (first.unchanged) throw new Error("expected a snapshot");
    const mover = first.snapshot.view!.current;
    const waiter = 1 - mover;

    const moverSnap = await pollOnlineGame(host.id, tokens[mover], null, store);
    if (moverSnap.unchanged) throw new Error("expected a snapshot");
    const move = anyMove(moverSnap.snapshot);

    await rejects(playOnlineMove(host.id, tokens[waiter], move, store), "notYourTurn");
    await rejects(playOnlineMove(host.id, "intruder", move, store), "forbidden");
    await rejects(
      playOnlineMove(host.id, tokens[mover], { type: "place", placements: [{ tileId: 999, cell: 0 }] }, store),
      "notInRack",
    );

    const after = await playOnlineMove(host.id, tokens[mover], move, store);
    expect(after.rev).toBe(moverSnap.snapshot.rev + 1);
    expect(after.view!.board.filter(Boolean).length).toBe(move.placements.length);

    expect(await pollOnlineGame(host.id, tokens[waiter], after.rev, store)).toEqual({ unchanged: true, rev: after.rev });
    await rejects(rematchOnlineGame(host.id, host.token, store), "notOver");
  });

  it("lets only the host start early, with two players or more", async () => {
    const host = await createOnlineGame("Ana", 4, store);
    await rejects(startOnlineGame(host.id, host.token, store), "badRequest");
    const guest = await joinOnlineGame(host.id, "Bob", store);
    expect(guest.snapshot.started).toBe(false);
    await rejects(startOnlineGame(host.id, guest.token, store), "forbidden");
    const started = await startOnlineGame(host.id, host.token, store);
    expect(started.started).toBe(true);
    expect(started.seats).toBe(2);
  });

  it("reports missing games", async () => {
    await rejects(pollOnlineGame("nope42", null, null, store), "notFound");
    await rejects(joinOnlineGame("nope42", "Ana", store), "notFound");
  });

  it("is unavailable without a store", async () => {
    await rejects(createOnlineGame("Ana", 2, null), "unavailable");
  });
});

describe("protocol", () => {
  it("cleans names", () => {
    expect(cleanName("  Ana   Lou ")).toBe("Ana Lou");
    expect(cleanName("")).toBeNull();
    expect(cleanName("x".repeat(21))).toBeNull();
    expect(cleanName(42)).toBeNull();
  });

  it("only accepts well formed moves", () => {
    expect(parseMove({ type: "pass" })).toEqual({ type: "pass" });
    expect(parseMove({ type: "exchange", tileIds: [1, 2] })).toEqual({ type: "exchange", tileIds: [1, 2] });
    expect(parseMove({ type: "place", placements: [{ tileId: 1, cell: 112, value: 4 }] })).toEqual({
      type: "place",
      placements: [{ tileId: 1, cell: 112, value: 4 }],
    });
    expect(parseMove({ type: "place", placements: [] })).toBeNull();
    expect(parseMove({ type: "place", placements: [{ tileId: "1", cell: 2 }] })).toBeNull();
    expect(parseMove({ type: "exchange", tileIds: [1, 2, 3, 4] })).toBeNull();
    expect(parseMove(null)).toBeNull();
    expect(parseMove({ type: "nuke" })).toBeNull();
  });

  it("reads a game id from a code or a link", () => {
    expect(extractGameId("abc234")).toBe("abc234");
    expect(extractGameId("https://trios.vercel.app/g/ABC234/")).toBe("abc234");
    expect(extractGameId("not a code!")).toBeNull();
  });
});

describe("findUpstashEnv", () => {
  it("accepts Upstash, Vercel KV and custom prefixed variables", () => {
    expect(findUpstashEnv({ UPSTASH_REDIS_REST_URL: "u", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(findUpstashEnv({ KV_REST_API_URL: "u", KV_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(findUpstashEnv({ STORAGE_REST_API_URL: "u", STORAGE_REST_API_TOKEN: "t" })).toEqual({ url: "u", token: "t" });
    expect(findUpstashEnv({ KV_REST_API_URL: "u" })).toBeNull();
    expect(findUpstashEnv({})).toBeNull();
  });
});
