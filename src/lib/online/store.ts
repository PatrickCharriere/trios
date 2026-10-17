import { Redis } from "@upstash/redis";
import type { GameState } from "@/engine";
import type { PushTarget } from "@/lib/push/protocol";

export interface Member {
  name: string;
  token: string;
  /** Where to send this player's notifications, when they turned them on. */
  push?: PushTarget;
  /** The player removed the game from their list. Once every player has, the game is deleted. */
  left?: boolean;
}

/** Everything the server keeps about one online game. */
export interface OnlineRecord {
  id: string;
  rev: number;
  createdAt: number;
  seats: number;
  members: Member[];
  /** Null while players are still joining. */
  state: GameState | null;
}

export interface Store {
  kind: "upstash" | "memory";
  get(id: string): Promise<OnlineRecord | null>;
  /** Saves a new record unless the id is taken. */
  create(record: OnlineRecord): Promise<boolean>;
  put(record: OnlineRecord): Promise<void>;
  remove(id: string): Promise<void>;
  /** Takes the game's write lock, or returns null if it stays busy. */
  lock(id: string): Promise<(() => Promise<void>) | null>;
}

/** Games expire two weeks after their last move. */
export const TTL_SECONDS = 60 * 60 * 24 * 14;
const LOCK_MS = 5000;
const LOCK_TRIES = 25;

const gameKey = (id: string) => `trios:game:${id}`;
const lockKey = (id: string) => `trios:lock:${id}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Finds Upstash credentials. Vercel's Upstash integration sets KV_REST_API_*
 * (or a custom prefix such as STORAGE_REST_API_*); a direct Upstash database
 * uses UPSTASH_REDIS_REST_*.
 */
export function findUpstashEnv(env: Record<string, string | undefined> = process.env): { url: string; token: string } | null {
  const pairs: [string, string][] = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ];
  for (const key of Object.keys(env).sort()) {
    if (key.endsWith("_REST_API_URL") || key.endsWith("_REDIS_REST_URL")) {
      pairs.push([key, key.replace(/_URL$/, "_TOKEN")]);
    }
  }
  for (const [urlKey, tokenKey] of pairs) {
    const url = env[urlKey];
    const token = env[tokenKey];
    if (url && token) return { url, token };
  }
  return null;
}

export function upstashStore(url: string, token: string): Store {
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    kind: "upstash",
    async get(id) {
      const raw = await redis.get<string>(gameKey(id));
      return raw ? (JSON.parse(raw) as OnlineRecord) : null;
    },
    async create(record) {
      const result = await redis.set(gameKey(record.id), JSON.stringify(record), { nx: true, ex: TTL_SECONDS });
      return result === "OK";
    },
    async put(record) {
      await redis.set(gameKey(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
    },
    async remove(id) {
      await redis.del(gameKey(id));
    },
    async lock(id) {
      const key = lockKey(id);
      const owner = crypto.randomUUID();
      for (let i = 0; i < LOCK_TRIES; i++) {
        if ((await redis.set(key, owner, { nx: true, px: LOCK_MS })) === "OK") {
          return async () => {
            // Only release our own lock: if it expired during a slow request,
            // someone else may hold it now. (Check then delete is not atomic,
            // but the window is one round trip on a 5 second lock.)
            if ((await redis.get<string>(key)) === owner) await redis.del(key);
          };
        }
        await pause(60 + Math.random() * 60);
      }
      return null;
    },
  };
}

interface MemoryData {
  games: Map<string, { json: string; expires: number }>;
  locks: Map<string, number>;
}

/** In-process store for local development; it does not survive a restart. */
export function memoryStore(): Store {
  const holder = globalThis as unknown as { __triosMemory?: MemoryData };
  const data = (holder.__triosMemory ??= { games: new Map(), locks: new Map() });
  const read = (id: string) => {
    const entry = data.games.get(id);
    if (!entry || entry.expires < Date.now()) return null;
    return JSON.parse(entry.json) as OnlineRecord;
  };
  const write = (record: OnlineRecord) =>
    data.games.set(record.id, { json: JSON.stringify(record), expires: Date.now() + TTL_SECONDS * 1000 });
  return {
    kind: "memory",
    async get(id) {
      return read(id);
    },
    async create(record) {
      if (read(record.id)) return false;
      write(record);
      return true;
    },
    async put(record) {
      write(record);
    },
    async remove(id) {
      data.games.delete(id);
    },
    async lock(id) {
      for (let i = 0; i < LOCK_TRIES; i++) {
        const until = data.locks.get(id) ?? 0;
        if (until < Date.now()) {
          data.locks.set(id, Date.now() + LOCK_MS);
          return async () => {
            data.locks.delete(id);
          };
        }
        await pause(20);
      }
      return null;
    },
  };
}

/**
 * The store for this deployment, or null when online play isn't configured.
 * The memory store is only used outside production (or when forced with
 * TRIOS_MEMORY_STORE=1), because serverless instances don't share memory.
 */
export function getStore(): Store | null {
  const upstash = findUpstashEnv();
  if (upstash) return upstashStore(upstash.url, upstash.token);
  if (process.env.NODE_ENV !== "production" || process.env.TRIOS_MEMORY_STORE === "1") return memoryStore();
  return null;
}
