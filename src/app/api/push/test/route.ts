import { readBody, respond } from "@/lib/online/http";
import { OnlineError } from "@/lib/online/service";
import { testMessage } from "@/lib/push/notices";
import { parseSubscription } from "@/lib/push/protocol";
import { sendPush, vapidKeys } from "@/lib/push/webpush";

/** Sends a test notification to the browser that asks, from the settings. */
export async function POST(request: Request) {
  return respond(async () => {
    const body = await readBody(request);
    const target = parseSubscription(body.subscription, body.lang);
    if (!target) throw new OnlineError("badRequest", 400);
    const keys = vapidKeys();
    if (!keys) throw new OnlineError("unavailable", 503);
    return { result: await sendPush(target, testMessage(target.lang), keys) };
  });
}
