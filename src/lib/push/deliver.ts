import { after } from "next/server";
import { forgetPushTargets, type Notify } from "@/lib/online/service";
import type { Notice } from "./notices";
import { sendPush, vapidKeys } from "./webpush";

/** Sends notifications, then forgets the subscriptions their push services reported as gone. */
export async function deliver(notices: Notice[], keys = vapidKeys()): Promise<void> {
  if (!keys) return;
  const results = await Promise.all(notices.map((n) => sendPush(n.target, n.message, keys)));
  const gone = new Map<string, string[]>();
  notices.forEach((n, i) => {
    if (results[i] === "gone") gone.set(n.gameId, [...(gone.get(n.gameId) ?? []), n.target.endpoint]);
  });
  for (const [gameId, endpoints] of gone) await forgetPushTargets(gameId, endpoints).catch(() => {});
}

/** For the API routes: sends an action's notifications once the response has gone out. */
export const notifyAfterResponse: Notify = (notices) => {
  if (notices.length > 0 && vapidKeys()) after(() => deliver(notices));
};
