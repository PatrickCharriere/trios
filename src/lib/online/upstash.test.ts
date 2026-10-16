import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOnlineGame, joinOnlineGame, pollOnlineGame } from "./service";
import { upstashStore, type Store } from "./store";

/**
 * A tiny stand-in for the Upstash REST API (GET, SET with NX/EX/PX, DEL),
 * so the real @upstash/redis client can be exercised without the network.
 */
function fakeUpstash() {
  const data = new Map<string, { value: string; expires: number }>();
  const auth: string[] = [];

  const live = (key: string) => {
    const entry = data.get(key);
    if (entry && entry.expires < Date.now()) data.delete(key);
    return data.get(key);
  };

  const run = ([name, ...args]: string[]): unknown => {
    switch (name.toUpperCase()) {
      case "GET":
        return live(args[0])?.value ?? null;
      case "DEL":
        return data.delete(args[0]) ? 1 : 0;
      case "SET": {
        const [key, value, ...opts] = args;
        let ttl = Infinity;
        let nx = false;
        for (let i = 0; i < opts.length; i++) {
          const opt = String(opts[i]).toUpperCase();
          if (opt === "NX") nx = true;
          if (opt === "EX") ttl = Number(opts[++i]) * 1000;
          if (opt === "PX") ttl = Number(opts[++i]);
        }
        if (nx && live(key)) return null;
        data.set(key, { value: String(value), expires: Date.now() + ttl });
        return "OK";
      }
      default:
        throw new Error(`fake upstash: unsupported ${name}`);
    }
  };

  const encode = (result: unknown, base64: boolean) =>
    base64 && typeof result === "string" && result !== "OK" ? Buffer.from(result).toString("base64") : result;

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      auth.push(req.headers.authorization ?? "");
      const base64 = req.headers["upstash-encoding"] === "base64";
      const parsed = JSON.parse(body);
      res.setHeader("content-type", "application/json");
      if (req.url === "/pipeline" || req.url === "/multi-exec") {
        res.end(JSON.stringify((parsed as string[][]).map((cmd) => ({ result: encode(run(cmd), base64) }))));
      } else {
        res.end(JSON.stringify({ result: encode(run(parsed), base64) }));
      }
    });
  });
  return { server, data, auth };
}

describe("Upstash store", () => {
  const fake = fakeUpstash();
  let store: Store;

  beforeAll(async () => {
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
    const { port } = fake.server.address() as AddressInfo;
    store = upstashStore(`http://127.0.0.1:${port}`, "secret-token");
  });

  afterAll(() => new Promise<void>((resolve) => (fake.server as Server).close(() => resolve())));

  it("stores records, refuses duplicates and locks", async () => {
    const record = { id: "abc234", rev: 1, createdAt: 1, seats: 2, members: [{ name: "Ana", token: "t" }], state: null };
    expect(await store.create(record)).toBe(true);
    expect(await store.create(record)).toBe(false);
    expect(await store.get("abc234")).toEqual(record);
    expect(await store.get("missing")).toBeNull();

    await store.put({ ...record, rev: 2 });
    expect((await store.get("abc234"))?.rev).toBe(2);

    const release = await store.lock("abc234");
    expect(release).not.toBeNull();
    expect(fake.data.has("trios:lock:abc234")).toBe(true);
    await release!();
    expect(fake.data.has("trios:lock:abc234")).toBe(false);
    expect(fake.auth.every((h) => h === "Bearer secret-token")).toBe(true);
  });

  it("serves a whole online game", async () => {
    const host = await createOnlineGame("Ana", 2, store);
    const guest = await joinOnlineGame(host.id, "Bob", store);
    expect(guest.snapshot.started).toBe(true);
    const poll = await pollOnlineGame(host.id, host.token, null, store);
    expect(!poll.unchanged && poll.snapshot.view?.rack).toHaveLength(3);
  });
});
