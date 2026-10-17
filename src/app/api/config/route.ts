import { connection } from "next/server";
import { getStore } from "@/lib/online/store";
import { vapidKeys } from "@/lib/push/webpush";

export async function GET() {
  // Read the environment per request, not once at build time.
  await connection();
  const online = getStore() !== null;
  // The key browsers subscribe with; notifications only matter when online play is on.
  const push = online ? (vapidKeys()?.publicKey ?? null) : null;
  return Response.json({ online, push }, { headers: { "cache-control": "no-store" } });
}
