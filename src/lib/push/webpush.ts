import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type ECDH, type KeyObject } from "node:crypto";
import type { PushMessage, PushTarget } from "./protocol";

/*
 * Web push with Node's crypto, no library: each message is encrypted for the
 * browser it goes to (RFC 8291, "aes128gcm"), and each request carries a
 * token signed with this server's VAPID key (RFC 8292), which is what the
 * browser subscribed with. The tests check the encryption byte for byte
 * against the reference implementation.
 */

export interface VapidKeys {
  /** The uncompressed P-256 public key (65 bytes), base64url: what browsers subscribe with. */
  publicKey: string;
  privateKey: KeyObject;
  /** How the push services can reach whoever runs the server: a mailto: or https: URL. */
  subject: string;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

let cached: { from: string; keys: VapidKeys | null } | undefined;

/**
 * The VAPID keys from the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and,
 * optionally, VAPID_SUBJECT), or null when push isn't set up or the keys can't be used.
 */
export function vapidKeys(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const site = env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject = env.VAPID_SUBJECT?.trim() || (site ? `https://${site}` : "mailto:trios@example.com");
  const from = [publicKey, privateKey, subject].join(" ");
  if (cached?.from === from) return cached.keys;

  let keys: VapidKeys | null = null;
  try {
    const point = Buffer.from(publicKey, "base64url");
    const check = createECDH("prime256v1");
    check.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (!check.getPublicKey().equals(point)) throw new Error("VAPID_PUBLIC_KEY isn't the public half of VAPID_PRIVATE_KEY");
    const key = createPrivateKey({
      key: { kty: "EC", crv: "P-256", d: privateKey, x: b64(point.subarray(1, 33)), y: b64(point.subarray(33)) },
      format: "jwk",
    });
    keys = { publicKey, privateKey: key, subject };
  } catch (error) {
    console.error("Push notifications are off: the VAPID keys can't be used.", error);
  }
  cached = { from, keys };
  return keys;
}

const hkdf = (secret: Buffer, salt: Buffer, info: string | Buffer, length: number) =>
  Buffer.from(hkdfSync("sha256", secret, salt, info, length));

/** The largest record; the whole message fits in one. */
const RECORD_SIZE = 4096;

/**
 * Encrypts a message for one browser (RFC 8291). `fixed` pins the random salt
 * and the one-off server key, for tests only.
 */
export function encrypt(plaintext: Buffer, target: Pick<PushTarget, "p256dh" | "auth">, fixed?: { salt: Buffer; key: ECDH }): Buffer {
  // The record also holds a delimiter byte and the 16 byte authentication tag.
  if (plaintext.length > RECORD_SIZE - 17) throw new Error("Push message too long");
  const browserKey = Buffer.from(target.p256dh, "base64url");
  const authSecret = Buffer.from(target.auth, "base64url");
  const serverKey = fixed?.key ?? createECDH("prime256v1");
  if (!fixed) serverKey.generateKeys();
  const serverPublic = serverKey.getPublicKey();
  const salt = fixed?.salt ?? randomBytes(16);

  const ikm = hkdf(
    serverKey.computeSecret(browserKey),
    authSecret,
    Buffer.concat([Buffer.from("WebPush: info\0"), browserKey, serverPublic]),
    32,
  );
  const cipher = createCipheriv("aes-128-gcm", hkdf(ikm, salt, "Content-Encoding: aes128gcm\0", 16), hkdf(ikm, salt, "Content-Encoding: nonce\0", 12));
  // A single record: the message, then 0x02, which marks the last record.
  const record = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, record]);
}

/** The Authorization header that identifies this server to a push service (RFC 8292). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): string {
  const part = (value: object) => b64(Buffer.from(JSON.stringify(value)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({
    aud: new URL(endpoint).origin,
    // Push services refuse tokens valid for more than a day.
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: keys.subject,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: keys.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64(signature)}, k=${keys.publicKey}`;
}

/** "gone": the browser unsubscribed or the subscription can never work, so forget it. */
export type PushResult = "sent" | "gone" | "failed";

/** How long a push service keeps a notification for a phone that is off or offline. */
const PUSH_TTL_SECONDS = 12 * 60 * 60;

export async function sendPush(
  target: PushTarget,
  message: PushMessage,
  keys: VapidKeys,
  send: typeof fetch = fetch,
): Promise<PushResult> {
  let body: Buffer;
  try {
    body = encrypt(Buffer.from(JSON.stringify(message)), target);
  } catch {
    // Only a key that isn't a real P-256 point gets here: it will never work.
    return "gone";
  }
  try {
    const response = await send(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(target.endpoint, keys),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404 || response.status === 410) return "gone";
    if (!response.ok) {
      console.warn(`Push refused by ${new URL(target.endpoint).host} (${response.status}): ${(await response.text()).slice(0, 200)}`);
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.warn("Push failed", error);
    return "failed";
  }
}
