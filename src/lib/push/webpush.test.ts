import { createDecipheriv, createECDH, generateKeyPairSync, hkdfSync, verify, type ECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isPushEndpoint, parseSubscription, type PushMessage, type PushTarget } from "./protocol";
import { encrypt, sendPush, vapidAuthorization, vapidKeys } from "./webpush";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromB64 = (text: string) => Buffer.from(text, "base64url");
const hkdf = (secret: Buffer, salt: Buffer, info: string | Buffer, length: number) =>
  Buffer.from(hkdfSync("sha256", secret, salt, info, length));

/** What the browser does with a push message (RFC 8291), written out separately from the server's side. */
function decrypt(body: Buffer, browser: ECDH, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const serverPublic = body.subarray(21, 21 + body[20]);
  const record = body.subarray(21 + body[20]);
  const ikm = hkdf(
    browser.computeSecret(serverPublic),
    auth,
    Buffer.concat([Buffer.from("WebPush: info\0"), browser.getPublicKey(), serverPublic]),
    32,
  );
  const decipher = createDecipheriv("aes-128-gcm", hkdf(ikm, salt, "Content-Encoding: aes128gcm\0", 16), hkdf(ikm, salt, "Content-Encoding: nonce\0", 12));
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (padded[end] === 0) end--;
  expect(padded[end]).toBe(2);
  return padded.subarray(0, end).toString();
}

function browser() {
  const keys = createECDH("prime256v1");
  keys.generateKeys();
  const auth = Buffer.alloc(16, 7);
  const target: PushTarget = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc:def",
    p256dh: b64(keys.getPublicKey()),
    auth: b64(auth),
    lang: "fr",
  };
  return { keys, auth, target };
}

function serverEnv() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = b64(Buffer.concat([Buffer.from([4]), fromB64(jwk.x!), fromB64(jwk.y!)]));
  return { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: "mailto:test@example.org" };
}

describe("encrypt", () => {
  it("matches the reference implementation byte for byte", () => {
    // Made with http_ece, the reference implementation of RFC 8188 and 8291, from these keys and salt.
    const server = createECDH("prime256v1");
    server.setPrivateKey(fromB64("s47MdSc-MNlAvDbZoDDMqaFm_re3ChDopohyss2d_UY"));
    const body = encrypt(
      Buffer.from("Au tour de Trios : 15 partout."),
      { p256dh: "BHXMF1NZXX6V7QXgflzm-64Mand7BDUsSwg_lvLEOj_56bEuaj8jtyPgHywWVJ8n4GF2fJ5UL4dcHe4slIn8kQY", auth: "zY7foNKP376xgSFW_nQU6g" },
      { salt: fromB64("2eijkqMjPJ59N1EPPDfbhA"), key: server },
    );
    expect(b64(body)).toBe(
      "2eijkqMjPJ59N1EPPDfbhAAAEABBBL5baczxn0xATpSwZM0VgQU0Sm24yJM6azBPwhC2-ENE_64wJmt_s-dnSIvNin73MLNEcIwtJWdi0-27F-M2exhVnEn4H-ZqzaKyn4XtyXbQ2HZRsta7UZQGfot89DVnF3gLOgKA4NCFtU3GFyo-qw",
    );
  });

  it("can be read by the browser it was made for, and only by it", () => {
    const { keys, auth, target } = browser();
    const body = encrypt(Buffer.from("À vous de jouer"), target);
    expect(decrypt(body, keys, auth)).toBe("À vous de jouer");
    const stranger = createECDH("prime256v1");
    stranger.generateKeys();
    expect(() => decrypt(body, stranger, auth)).toThrow();
  });

  it("uses a new salt and key for every message", () => {
    const { target } = browser();
    const a = encrypt(Buffer.from("same"), target);
    const b = encrypt(Buffer.from("same"), target);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
    expect(a.equals(b)).toBe(false);
  });
});

describe("VAPID", () => {
  it("reads the keys from the environment and refuses keys that don't belong together", () => {
    const env = serverEnv();
    expect(vapidKeys(env)?.publicKey).toBe(env.VAPID_PUBLIC_KEY);
    expect(vapidKeys({})).toBeNull();
    expect(vapidKeys({ ...env, VAPID_PUBLIC_KEY: serverEnv().VAPID_PUBLIC_KEY })).toBeNull();
    expect(vapidKeys({ ...env, VAPID_PRIVATE_KEY: "not a key" })).toBeNull();
  });

  it("falls back to the site's address as the contact", () => {
    const { VAPID_SUBJECT, ...env } = serverEnv();
    expect(VAPID_SUBJECT).toBeTruthy();
    expect(vapidKeys({ ...env, VERCEL_PROJECT_PRODUCTION_URL: "trios.example.org" })?.subject).toBe("https://trios.example.org");
  });

  it("signs a token for the push service's origin, valid for less than a day", () => {
    const env = serverEnv();
    const keys = vapidKeys(env)!;
    const now = Date.UTC(2026, 9, 17, 8);
    const header = vapidAuthorization("https://web.push.apple.com/QGuQyavXutnMH4", keys, now);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    const [head, claims, signature] = token.split(".");
    expect(k).toBe(env.VAPID_PUBLIC_KEY);
    expect(JSON.parse(fromB64(head).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    const body = JSON.parse(fromB64(claims).toString());
    expect(body).toEqual({ aud: "https://web.push.apple.com", exp: now / 1000 + 12 * 3600, sub: "mailto:test@example.org" });
    const point = fromB64(env.VAPID_PUBLIC_KEY);
    const ok = verify(
      "sha256",
      Buffer.from(`${head}.${claims}`),
      { key: { kty: "EC", crv: "P-256", x: b64(point.subarray(1, 33)), y: b64(point.subarray(33)) }, format: "jwk", dsaEncoding: "ieee-p1363" },
      fromB64(signature),
    );
    expect(ok).toBe(true);
  });
});

describe("sendPush", () => {
  const message: PushMessage = { title: "À vous de jouer", body: "Ana a marqué 29 points.", url: "/g/abc234", tag: "trios-abc234" };

  it("posts the encrypted message with the push headers", async () => {
    const { keys, auth, target } = browser();
    const requests: { url: string; init: RequestInit }[] = [];
    const send = async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init! });
      return new Response(null, { status: 201 });
    };
    expect(await sendPush(target, message, vapidKeys(serverEnv())!, send as typeof fetch)).toBe("sent");
    const [{ url, init }] = requests;
    expect(url).toBe(target.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("43200");
    expect(headers.Urgency).toBe("high");
    expect(JSON.parse(decrypt(Buffer.from(init.body as Uint8Array), keys, auth))).toEqual(message);
  });

  it("tells a dead subscription from a passing failure", async () => {
    const { target } = browser();
    const keys = vapidKeys(serverEnv())!;
    const answering = (status: number) => (async () => new Response("nope", { status })) as unknown as typeof fetch;
    expect(await sendPush(target, message, keys, answering(410))).toBe("gone");
    expect(await sendPush(target, message, keys, answering(404))).toBe("gone");
    expect(await sendPush(target, message, keys, answering(429))).toBe("failed");
    expect(await sendPush(target, message, keys, answering(500))).toBe("failed");
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await sendPush(target, message, keys, offline)).toBe("failed");
    // A key that isn't a point on the curve can never work.
    expect(await sendPush({ ...target, p256dh: b64(Buffer.alloc(65, 1)) }, message, keys, answering(201))).toBe("gone");
  });
});

describe("subscriptions sent by browsers", () => {
  const keys = { p256dh: b64(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)])), auth: b64(Buffer.alloc(16, 3)) };

  it("accepts the browsers' push services", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/dXhN:APA91b",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://web.push.apple.com/QGuQyavXutnMH4",
      "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ]) {
      expect(parseSubscription({ endpoint, keys }, "en")).toEqual({ endpoint, ...keys, lang: "en" });
    }
  });

  it("refuses anything else, so the server can't be sent elsewhere", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:8443/fcm/send/x",
      "https://user:pass@fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.example.org/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "not a url",
    ]) {
      expect(isPushEndpoint(endpoint)).toBe(false);
    }
    const endpoint = "https://fcm.googleapis.com/fcm/send/x";
    expect(parseSubscription({ endpoint, keys: { ...keys, auth: "short" } }, "fr")).toBeNull();
    expect(parseSubscription({ endpoint, keys: { ...keys, p256dh: keys.auth } }, "fr")).toBeNull();
    expect(parseSubscription({ endpoint }, "fr")).toBeNull();
    expect(parseSubscription("subscription", "fr")).toBeNull();
    // Anything but English is written in French, the game's main language.
    expect(parseSubscription({ endpoint, keys }, "de")?.lang).toBe("fr");
  });
});
