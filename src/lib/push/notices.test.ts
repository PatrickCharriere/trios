import { describe, expect, it } from "vitest";
import { createGame, generateMoves, type GameState } from "@/engine";
import {
  OnlineError,
  createOnlineGame,
  forgetPushTargets,
  joinOnlineGame,
  leaveOnlineGame,
  playOnlineMove,
  pollOnlineGame,
  setOnlinePush,
} from "@/lib/online/service";
import { memoryStore, type OnlineRecord } from "@/lib/online/store";
import { noticesAfter, type Notice } from "./notices";
import type { PushTarget } from "./protocol";

const store = memoryStore();

const target = (name: string, lang: "fr" | "en" = "fr"): PushTarget => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
  p256dh: "B".padEnd(87, "A"),
  auth: "A".repeat(22),
  lang,
});

/** A two player record in a given state, both players with notifications on. */
function record(change: (state: GameState) => void, langs: ["fr" | "en", "fr" | "en"] = ["fr", "fr"]): OnlineRecord {
  const state = createGame([
    { name: "Ana", kind: "human" },
    { name: "Bob", kind: "human" },
  ]);
  change(state);
  return {
    id: "abc234",
    rev: 3,
    createdAt: 0,
    seats: 2,
    members: [
      { name: "Ana", token: "a", push: target("ana", langs[0]) },
      { name: "Bob", token: "b", push: target("bob", langs[1]) },
    ],
    state,
  };
}

/** Who gets what. French text has non-breaking spaces before high punctuation; they read as spaces here. */
const NB = String.fromCharCode(160);
const said = (notices: Notice[]) =>
  notices.map((n) => [n.target.endpoint.split("/").pop(), n.message.title, n.message.body.replaceAll(NB, " ")]);

describe("noticesAfter", () => {
  it("tells the player whose turn it now is what the other one did", () => {
    const placed = record((s) => {
      s.current = 1;
      s.log.push({ type: "place", player: 0, cells: [112], score: 29, groups: [], triolet: false, replay: false });
    });
    expect(said(noticesAfter(placed, 0))).toEqual([["bob", "À vous de jouer", "Ana a marqué 29 points."]]);
    expect(noticesAfter(placed, 0)[0].message).toMatchObject({ url: "/g/abc234", tag: "trios-abc234" });

    const passed = record((s) => {
      s.current = 0;
      s.log.push({ type: "pass", player: 1 });
    }, ["en", "fr"]);
    expect(said(noticesAfter(passed, 1))).toEqual([["ana", "Your turn", "Bob passed."]]);

    const exchanged = record((s) => {
      s.current = 0;
      s.log.push({ type: "exchange", player: 1, count: 1 });
    });
    expect(said(noticesAfter(exchanged, 1))).toEqual([["ana", "À vous de jouer", "Bob a échangé 1 jeton."]]);
  });

  it("says who a new game is against", () => {
    const fresh = record((s) => (s.current = 0));
    expect(said(noticesAfter(fresh, 1))).toEqual([["ana", "À vous de jouer", "La partie contre Bob commence : vous jouez en premier."]]);
  });

  it("stays quiet for the player who acted, including when they play again", () => {
    const again = record((s) => {
      s.current = 0;
      s.log.push({ type: "place", player: 0, cells: [112], score: 12, groups: [], triolet: false, replay: true });
    });
    expect(noticesAfter(again, 0)).toEqual([]);
  });

  it("gives everyone else the result when the game ends", () => {
    const over = (winners: number[]) =>
      record((s) => {
        s.status = "over";
        s.players[0].score = 312;
        s.players[1].score = winners.length > 1 ? 312 : 287;
        s.winners = winners;
      }, ["fr", "en"]);
    expect(said(noticesAfter(over([0]), 0))).toEqual([["bob", "Game over", "Ana won with 312 points."]]);
    expect(said(noticesAfter(over([0]), 1))).toEqual([["ana", "Partie terminée", "Vous avez gagné avec 312 points !"]]);
    expect(said(noticesAfter(over([0, 1]), 0))).toEqual([["bob", "Game over", "It’s a tie between Ana and you, on 312 points."]]);
  });

  it("only writes to players who turned notifications on, and not before the game starts", () => {
    const quiet = record((s) => (s.current = 1));
    delete quiet.members[1].push;
    expect(noticesAfter(quiet, 0)).toEqual([]);
    expect(noticesAfter({ ...quiet, state: null }, 0)).toEqual([]);
  });
});

describe("online games with notifications", () => {
  it("notifies the first player when the last one joins, then after each move", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    await setOnlinePush(host.id, host.token, target("ana"), store);
    let notices: Notice[] = [];
    const notify = (n: Notice[]) => (notices = n);

    const guest = await joinOnlineGame(host.id, "Bob", store, notify);
    await setOnlinePush(host.id, guest.token, target("bob", "en"), store);
    const first = guest.snapshot.view!.current;
    // The guest just joined and is looking at the game; only a waiting host hears about it.
    expect(said(notices)).toEqual(first === 0 ? [["ana", "À vous de jouer", "La partie contre Bob commence : vous jouez en premier."]] : []);

    const tokens = [host.token, guest.token];
    const polled = await pollOnlineGame(host.id, tokens[first], null, store);
    if (polled.unchanged) throw new Error("expected a snapshot");
    const { board, rack } = polled.snapshot.view!;
    const [move] = generateMoves(board, rack, { limit: 1 });
    await playOnlineMove(host.id, tokens[first], { type: "place", placements: move.placements }, store, notify);
    expect(notices).toHaveLength(1);
    expect(notices[0].target.endpoint).toBe(target(first === 0 ? "bob" : "ana").endpoint);
  });

  it("only lets a player change their own notifications", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    await expect(setOnlinePush(host.id, "intruder", target("x"), store)).rejects.toSatisfy(
      (e) => e instanceof OnlineError && e.code === "forbidden",
    );
  });

  it("stops notifying a player who leaves, and deletes the game once everyone has left", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    const guest = await joinOnlineGame(host.id, "Bob", store);
    await setOnlinePush(host.id, host.token, target("ana"), store);
    await setOnlinePush(host.id, guest.token, target("bob"), store);

    await leaveOnlineGame(host.id, host.token, store);
    let saved = await store.get(host.id);
    expect(saved!.members[0]).toMatchObject({ left: true });
    expect(saved!.members[0].push).toBeUndefined();
    expect(saved!.members[1].push).toBeDefined();

    // Coming back to the game (turning notifications on again here) undoes leaving.
    await setOnlinePush(host.id, host.token, target("ana"), store);
    saved = await store.get(host.id);
    expect(saved!.members[0].left).toBeUndefined();

    await leaveOnlineGame(host.id, host.token, store);
    await leaveOnlineGame(host.id, guest.token, store);
    expect(await store.get(host.id)).toBeNull();
  });

  it("forgets subscriptions their push service says are gone", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    const guest = await joinOnlineGame(host.id, "Bob", store);
    await setOnlinePush(host.id, host.token, target("ana"), store);
    await setOnlinePush(host.id, guest.token, target("bob"), store);
    await forgetPushTargets(host.id, [target("bob").endpoint], store);
    const saved = await store.get(host.id);
    expect(saved!.members[0].push).toBeDefined();
    expect(saved!.members[1].push).toBeUndefined();
  });
});
