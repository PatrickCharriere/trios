import { applyMove, createGame, viewFor, type Move, type RuleError } from "@/engine";
import { noticesAfter, type Notice } from "@/lib/push/notices";
import type { PushTarget } from "@/lib/push/protocol";
import type { PollResult, SeatGrant, Snapshot } from "./protocol";
import { getStore, type OnlineRecord, type Store } from "./store";

export type OnlineErrorCode =
  | RuleError
  | "unavailable"
  | "notFound"
  | "full"
  | "started"
  | "forbidden"
  | "notOver"
  | "busy"
  | "badRequest"
  | "badName";

export class OnlineError extends Error {
  constructor(
    readonly code: OnlineErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}

// No i, l, o, 0 or 1 (easily confused), and no x, which some fonts draw as × between digits.
const ID_ALPHABET = "abcdefghjkmnpqrstuvwyz23456789";
const ID_LENGTH = 6;

/**
 * Takes the notifications an action calls for. The routes send them once the
 * response is out, so the player who acted never waits on the push services.
 */
export type Notify = (notices: Notice[]) => void;
const quiet: Notify = () => {};

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

function requireStore(store: Store | null = getStore()): Store {
  if (!store) throw new OnlineError("unavailable", 503);
  return store;
}

function seatOf(record: OnlineRecord, token: string | null): number | null {
  if (!token) return null;
  const seat = record.members.findIndex((m) => m.token === token);
  return seat >= 0 ? seat : null;
}

function requireSeat(record: OnlineRecord, token: string | null): number {
  const seat = seatOf(record, token);
  if (seat === null) throw new OnlineError("forbidden", 403);
  return seat;
}

export function toSnapshot(record: OnlineRecord, token: string | null): Snapshot {
  const seat = seatOf(record, token);
  return {
    id: record.id,
    rev: record.rev,
    seats: record.seats,
    names: record.members.map((m) => m.name),
    seat,
    started: record.state !== null,
    view: record.state ? viewFor(record.state, seat) : null,
  };
}

function deal(record: OnlineRecord) {
  record.seats = record.members.length;
  record.state = createGame(record.members.map((m) => ({ name: m.name, kind: "human" as const })));
}

/** Runs `change` on the latest record under the game's lock and saves it. */
async function mutate(store: Store, id: string, change: (record: OnlineRecord) => void): Promise<OnlineRecord> {
  const release = await store.lock(id);
  if (!release) throw new OnlineError("busy", 409);
  try {
    const record = await store.get(id);
    if (!record) throw new OnlineError("notFound", 404);
    change(record);
    record.rev += 1;
    await store.put(record);
    return record;
  } finally {
    await release();
  }
}

export async function createOnlineGame(name: string, seats: number, store = getStore()): Promise<SeatGrant> {
  const s = requireStore(store);
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const record: OnlineRecord = {
      id: randomId(),
      rev: 1,
      createdAt: Date.now(),
      seats,
      members: [{ name, token }],
      state: null,
    };
    if (await s.create(record)) return { id: record.id, token, seat: 0, snapshot: toSnapshot(record, token) };
  }
  throw new OnlineError("busy", 409);
}

export async function joinOnlineGame(id: string, name: string, store = getStore(), notify = quiet): Promise<SeatGrant> {
  const token = crypto.randomUUID();
  const record = await mutate(requireStore(store), id, (r) => {
    if (r.state) throw new OnlineError("started", 409);
    if (r.members.length >= r.seats) throw new OnlineError("full", 409);
    r.members.push({ name, token });
    if (r.members.length === r.seats) deal(r);
  });
  const seat = record.members.length - 1;
  // The last player in starts the game: whoever plays first may be waiting elsewhere.
  notify(noticesAfter(record, seat));
  return { id, token, seat, snapshot: toSnapshot(record, token) };
}

/** Lets the host start early with whoever has joined (two players at least). */
export async function startOnlineGame(id: string, token: string | null, store = getStore(), notify = quiet): Promise<Snapshot> {
  const record = await mutate(requireStore(store), id, (r) => {
    if (requireSeat(r, token) !== 0) throw new OnlineError("forbidden", 403);
    if (r.state) throw new OnlineError("started", 409);
    if (r.members.length < 2) throw new OnlineError("badRequest", 400);
    deal(r);
  });
  notify(noticesAfter(record, 0));
  return toSnapshot(record, token);
}

export async function pollOnlineGame(
  id: string,
  token: string | null,
  since: number | null,
  store = getStore(),
): Promise<PollResult> {
  const record = await requireStore(store).get(id);
  if (!record) throw new OnlineError("notFound", 404);
  if (since !== null && record.rev === since) return { unchanged: true, rev: record.rev };
  return { snapshot: toSnapshot(record, token) };
}

export async function playOnlineMove(
  id: string,
  token: string | null,
  move: Move,
  store = getStore(),
  notify = quiet,
): Promise<Snapshot> {
  let seat = -1;
  const record = await mutate(requireStore(store), id, (r) => {
    seat = requireSeat(r, token);
    if (!r.state) throw new OnlineError("notYourTurn", 409);
    const result = applyMove(r.state, seat, move);
    if (!result.ok) throw new OnlineError(result.error, 422);
    r.state = result.state;
    // Playing again means the player is back.
    delete r.members[seat].left;
  });
  notify(noticesAfter(record, seat));
  return toSnapshot(record, token);
}

export async function rematchOnlineGame(id: string, token: string | null, store = getStore(), notify = quiet): Promise<Snapshot> {
  let seat = -1;
  const record = await mutate(requireStore(store), id, (r) => {
    seat = requireSeat(r, token);
    if (r.state?.status !== "over") throw new OnlineError("notOver", 409);
    deal(r);
  });
  notify(noticesAfter(record, seat));
  return toSnapshot(record, token);
}

/** Turns a player's notifications on for this game (`target`) or off (null). */
export async function setOnlinePush(id: string, token: string | null, target: PushTarget | null, store = getStore()) {
  await mutate(requireStore(store), id, (r) => {
    const member = r.members[requireSeat(r, token)];
    if (target) {
      member.push = target;
      // Turning notifications on for a game means the player is back.
      delete member.left;
    } else {
      delete member.push;
    }
  });
  return { ok: true };
}

/**
 * A player removed the game from their list: no more notifications for them,
 * and once every player has done so, nobody can reach the game again, so it
 * is deleted rather than left to expire.
 */
export async function leaveOnlineGame(id: string, token: string | null, store = getStore()) {
  const s = requireStore(store);
  const record = await mutate(s, id, (r) => {
    const member = r.members[requireSeat(r, token)];
    member.left = true;
    delete member.push;
  });
  if (record.members.every((m) => m.left)) await s.remove(id);
  return { ok: true };
}

/** Drops subscriptions a push service reported as gone (unsubscribed or expired). */
export async function forgetPushTargets(id: string, endpoints: string[], store = getStore()) {
  const gone = new Set(endpoints);
  await mutate(requireStore(store), id, (r) => {
    for (const member of r.members) if (member.push && gone.has(member.push.endpoint)) delete member.push;
  });
}
