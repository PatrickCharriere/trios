import type { Lang } from "@/i18n/messages";
import { getHistory } from "@/lib/history";
import { api, listSeatIds, loadSeat } from "@/lib/online/client";
import { getSettings, updateSettings } from "@/lib/settings";

/*
 * Notifications in the browser. Turning them on asks for permission,
 * registers the service worker (public/sw.js), subscribes with the server's
 * key, and gives the subscription to each online game this browser plays
 * in. The server then pushes "your turn" for those games, even with the
 * browser closed.
 */

/** What the settings say about notifications on this device. */
export type PushStatus = "unsupported" | "install" | "unavailable" | "blocked" | "off" | "on";

/** The games this browser's subscription was given to, with the language it asked for. */
const SENT_KEY = "trios.push.v1";
interface Sent {
  endpoint: string;
  games: Record<string, Lang>;
}

function readSent(): Sent | null {
  try {
    return JSON.parse(window.localStorage.getItem(SENT_KEY) ?? "null") as Sent | null;
  } catch {
    return null;
  }
}

function writeSent(sent: Sent | null) {
  try {
    if (sent) window.localStorage.setItem(SENT_KEY, JSON.stringify(sent));
    else window.localStorage.removeItem(SENT_KEY);
  } catch {
    // Without storage, games get the subscription again each time they're opened.
  }
}

let key: Promise<string | null> | null = null;

/** The server's key for subscriptions, or null when it has notifications off. */
function serverKey(): Promise<string | null> {
  key ??= api.config().then(
    (config) => config.push,
    () => {
      key = null;
      return null;
    },
  );
  return key;
}

/** iPhones and iPads only allow notifications for sites added to the home screen. */
function needsHomeScreen(): boolean {
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return apple && !installed;
}

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return needsHomeScreen() ? "install" : "unsupported";
  if (!(await serverKey())) return "unavailable";
  if (Notification.permission === "denied") return "blocked";
  const on = getSettings().notify && Notification.permission === "granted" && (await currentSubscription()) !== null;
  return on ? "on" : "off";
}

/** Gives up on a step that hangs (a push service out of reach), so the settings never stay stuck. */
function within<T>(ms: number, step: Promise<T>): Promise<T> {
  return Promise.race([step, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out")), ms))]);
}

function decode(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}

/** Whether a subscription was made with this key (a new key means subscribing again). */
function madeWith(subscription: PushSubscription, publicKey: string): boolean {
  const used = subscription.options.applicationServerKey;
  if (!used) return false;
  const a = new Uint8Array(used);
  const b = decode(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** Gives one game this browser's subscription, unless it already has it in this language. */
async function sendToGame(id: string, subscription: PushSubscription, lang: Lang) {
  const seat = loadSeat(id);
  if (!seat) return;
  const sent = readSent();
  if (sent?.endpoint === subscription.endpoint && sent.games[id] === lang) return;
  try {
    await api.push(id, seat.token, subscription.toJSON(), lang);
    const latest = readSent();
    const games = latest?.endpoint === subscription.endpoint ? latest.games : {};
    writeSent({ endpoint: subscription.endpoint, games: { ...games, [id]: lang } });
  } catch {
    // An expired game, or no connection: tried again when the game is next opened.
  }
}

/**
 * Asks for permission, subscribes, and gives every online game in the list
 * the subscription. Call it straight from a tap: browsers only show the
 * permission prompt in answer to one.
 */
export async function turnPushOn(lang: Lang): Promise<PushStatus | "failed"> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  try {
    const publicKey = await serverKey();
    if (!publicKey) return "unavailable";
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    await within(10_000, navigator.serviceWorker.ready);
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !madeWith(subscription, publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await within(
      20_000,
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decode(publicKey) }),
    );
    updateSettings({ notify: true });
    // Games removed from the list stay out of it, and expired ones can't be reached.
    const skip = new Set(getHistory().flatMap((g) => (g.hidden || g.status === "expired" ? [g.id] : [])));
    for (const id of listSeatIds()) if (!skip.has(id)) await sendToGame(id, subscription, lang);
    return "on";
  } catch (error) {
    console.warn("Couldn't turn notifications on", error);
    return "failed";
  }
}

/** Takes this device off every game, then cancels the subscription. */
export async function turnPushOff() {
  updateSettings({ notify: false });
  const sent = readSent();
  writeSent(null);
  for (const id of Object.keys(sent?.games ?? {})) {
    const seat = loadSeat(id);
    if (seat) await api.push(id, seat.token, null, "fr").catch(() => {});
  }
  const subscription = await currentSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
}

/** When an online game opens: make sure it can reach this device, in the current language. */
export async function syncPush(id: string, lang: Lang) {
  if (!getSettings().notify || !supported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) await sendToGame(id, subscription, lang);
}

/** After leaving a game: it no longer has this device's subscription. */
export function forgetPushFor(id: string) {
  const sent = readSent();
  if (!sent?.games[id]) return;
  delete sent.games[id];
  writeSent(sent);
}

/** Asks the server for a test notification to this device. "gone": the subscription no longer works. */
export async function testPush(lang: Lang): Promise<"sent" | "gone" | "failed"> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return "gone";
  const { result } = await api.testPush(subscription.toJSON(), lang).catch(() => ({ result: "failed" as const }));
  return result;
}
