import type { Lang } from "@/i18n/messages";

/** What the server keeps to reach one browser: its push subscription, and the language to write in. */
export interface PushTarget {
  endpoint: string;
  /** The browser's public key (65 bytes) and auth secret (16 bytes) from its subscription, base64url. */
  p256dh: string;
  auth: string;
  lang: Lang;
}

/** What the service worker shows (public/sw.js). */
export interface PushMessage {
  title: string;
  body: string;
  /** The page a tap opens, such as /g/abc234. */
  url: string;
  /** A newer notification with the same tag replaces the older one: one per game. */
  tag: string;
}

/**
 * The push services of the browsers that support web push: Chrome and most
 * Chromium browsers, Firefox, Safari, and Edge on Windows. The server only
 * ever sends to these, so a stored subscription can't make it call anywhere else.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isPushEndpoint(raw: string): boolean {
  if (raw.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" && !url.port && !url.username && !url.password && PUSH_HOSTS.some((host) => host.test(url.hostname))
  );
}

/** A base64url key of exactly `bytes` bytes, with or without padding. */
const isKey = (value: unknown, bytes: number): value is string =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]+={0,2}$/.test(value) &&
  value.replace(/=+$/, "").length === Math.ceil((bytes * 4) / 3);

/** Checks a subscription sent by a browser (PushSubscription.toJSON()). */
export function parseSubscription(raw: unknown, lang: unknown): PushTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (!isKey(p256dh, 65) || !isKey(auth, 16)) return null;
  return { endpoint, p256dh, auth, lang: lang === "en" ? "en" : "fr" };
}
